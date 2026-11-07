import { randomUUID } from "node:crypto";
import express from "express";
import { z } from "zod";
export function companyAssetRoutes(app, { auth, organization, wrap, result }) {
  app.get(
    "/api/organization/photo",
    auth,
    organization("read"),
    wrap(async (req, res) => {
      const row = result(
        await req.db
          .from("organizations")
          .select("logo_path")
          .eq("id", req.org)
          .single(),
      );
      if (!row.logo_path) return res.json({ image: null });
      const file = result(
        await req.db.storage
          .from("organization-documents")
          .download(row.logo_path),
      );
      res.set("Cache-Control", "private, no-store");
      res.json({
        image:
          "data:" +
          file.type +
          ";base64," +
          Buffer.from(await file.arrayBuffer()).toString("base64"),
      });
    }),
  );
  app.post(
    "/api/organization/photo",
    auth,
    organization("manage"),
    express.raw({
      type: ["image/png", "image/jpeg", "image/webp"],
      limit: "2mb",
    }),
    wrap(async (req, res) => {
      const bytes = req.body,
        type = req.headers["content-type"]?.split(";")[0];
      const valid =
        Buffer.isBuffer(bytes) &&
        bytes.length > 12 &&
        ((type === "image/png" &&
          bytes
            .subarray(0, 8)
            .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) ||
          (type === "image/jpeg" &&
            bytes[0] === 255 &&
            bytes[1] === 216 &&
            bytes[2] === 255) ||
          (type === "image/webp" &&
            bytes.subarray(0, 4).toString() === "RIFF" &&
            bytes.subarray(8, 12).toString() === "WEBP"));
      if (!valid)
        return res
          .status(400)
          .json({
            error: "Choose a valid PNG, JPEG or WebP image under 2 MB.",
          });
      const previous = result(
        await req.db
          .from("organizations")
          .select("logo_path")
          .eq("id", req.org)
          .single(),
      );
      const path =
        req.org +
        "/photos/" +
        randomUUID() +
        "." +
        { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" }[type];
      result(
        await req.db.storage
          .from("organization-documents")
          .upload(path, bytes, { contentType: type }),
      );
      try {
        result(
          await req.db
            .from("organizations")
            .update({ logo_path: path })
            .eq("id", req.org)
            .select("id")
            .single(),
        );
      } catch (error) {
        await req.db.storage.from("organization-documents").remove([path]);
        throw error;
      }
      if (previous.logo_path)
        await req.db.storage
          .from("organization-documents")
          .remove([previous.logo_path]);
      res.status(201).json({ success: true });
    }),
  );
  app.delete(
    "/api/organization/photo",
    auth,
    organization("manage"),
    wrap(async (req, res) => {
      const row = result(
        await req.db
          .from("organizations")
          .select("logo_path")
          .eq("id", req.org)
          .single(),
      );
      result(
        await req.db
          .from("organizations")
          .update({ logo_path: null })
          .eq("id", req.org)
          .select("id")
          .single(),
      );
      if (row.logo_path)
        result(
          await req.db.storage
            .from("organization-documents")
            .remove([row.logo_path]),
        );
      res.json({ success: true });
    }),
  );
  app.delete(
    "/api/documents/:id",
    auth,
    organization("approve"),
    wrap(async (req, res) => {
      const id = z.string().uuid().parse(req.params.id);
      const doc = result(
        await req.db
          .from("documents")
          .select("path")
          .eq("organization_id", req.org)
          .eq("id", id)
          .single(),
      );
      result(
        await req.db.storage.from("organization-documents").remove([doc.path]),
      );
      result(
        await req.db
          .from("documents")
          .delete()
          .eq("organization_id", req.org)
          .eq("id", id),
      );
      res.json({ success: true });
    }),
  );
}
