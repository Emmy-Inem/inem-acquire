import React from "react";

export function PageSkeleton({ variant = "table", label = "Loading your records…" }) {
  return (
    <div className="skeletonSurface" role="status" aria-busy="true">
      <span className="screenReaderOnly">{label}</span>
      {variant === "dashboard" && (
        <>
          <div className="skeletonStats">
            {[1, 2, 3, 4].map((i) => (
              <div className="panel skeletonStatCard" key={i}>
                <span className="skeletonBar short" />
                <span className="skeletonBar metric" />
              </div>
            ))}
          </div>
          <div className="liveTwoColumns">
            {[1, 2].map((col) => (
              <div className="panel livePanel skeletonPanel" key={col}>
                <span className="skeletonBar heading" />
                {[1, 2, 3, 4, 5].map((row) => (
                  <div className="skeletonRow" key={row}>
                    <span className="skeletonBar medium" />
                    <span className="skeletonBar badge" />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </>
      )}

      {variant === "pipeline" && (
        <div className="kanban liveKanban skeletonKanban">
          {[1, 2, 3, 4, 5, 6].map((col) => (
            <div className="kanbanCol skeletonKanbanCol" key={col}>
              <div className="skeletonRow">
                <span className="skeletonBar short" />
                <span className="skeletonBar pill" />
              </div>
              {[1, 2].map((card) => (
                <div className="panel skeletonKanbanCard" key={card}>
                  <span className="skeletonBar medium" />
                  <span className="skeletonBar short" />
                  <span className="skeletonBar input" />
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {variant === "cards" && (
        <div className="skeletonCards">
          {[1, 2, 3, 4].map((card) => (
            <div className="panel livePanel skeletonCardItem" key={card}>
              <div className="skeletonCardHeader">
                <span className="skeletonBar heading" />
                <span className="skeletonBar badge" />
              </div>
              <span className="skeletonBar long" />
              <span className="skeletonBar medium" />
            </div>
          ))}
        </div>
      )}

      {variant === "inbox" && (
        <div className="liveTwoColumns">
          <div className="panel skeletonPanel">
            {[1, 2, 3, 4].map((i) => (
              <div className="skeletonStack" key={i}>
                <span className="skeletonBar medium" />
                <span className="skeletonBar short" />
              </div>
            ))}
          </div>
          <div className="panel livePanel skeletonPanel">
            <span className="skeletonBar heading" />
            <span className="skeletonBar long" />
            <span className="skeletonBar long" />
            <span className="skeletonBar medium" />
          </div>
        </div>
      )}

      {variant === "shell" && (
        <div className="skeletonShell">
          <div className="skeletonHeader">
            <span className="skeletonBar title" />
            <span className="skeletonBar medium" />
          </div>
          <div className="skeletonStats">
            {[1, 2, 3, 4].map((i) => (
              <div className="panel skeletonStatCard" key={i}>
                <span className="skeletonBar short" />
                <span className="skeletonBar metric" />
              </div>
            ))}
          </div>
          <div className="panel livePanel skeletonPanel">
            <span className="skeletonBar heading" />
            {[1, 2, 3, 4].map((r) => (
              <div className="skeletonRow" key={r}>
                <span className="skeletonBar medium" />
                <span className="skeletonBar short" />
                <span className="skeletonBar badge" />
              </div>
            ))}
          </div>
        </div>
      )}

      {variant === "table" && (
        <div className="skeletonTable">
          <div className="skeletonTableHead">
            {[1, 2, 3, 4, 5].map((i) => (
              <span className="skeletonBar short" key={i} />
            ))}
          </div>
          {[1, 2, 3, 4, 5, 6].map((row) => (
            <div className="skeletonTableRow" key={row}>
              <span className="skeletonBar medium" />
              <span className="skeletonBar short" />
              <span className="skeletonBar short" />
              <span className="skeletonBar badge" />
              <span className="skeletonBar pill" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
