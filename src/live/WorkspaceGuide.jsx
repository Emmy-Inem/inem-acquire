import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { useAuth } from "./AuthContext";
export default function WorkspaceGuide() {
  const { workspaceBase } = useAuth();
  return (
    <>
      <div className="pageHeader">
        <div>
          <h1>Your workspace guide</h1>
          <p>
            Build a connected acquisition process, one useful step at a time.
          </p>
        </div>
      </div>
      <section className="guideGrid">
        {[
          [
            "01",
            "Set the foundation",
            "Add company context, upload evidence and describe your offers.",
            "company",
            "Company & evidence",
          ],
          [
            "02",
            "Define and discover",
            "Build customer profiles and research companies. Add records manually, import a CSV or connect a research provider.",
            "prospects",
            "Discover prospects",
          ],
          [
            "03",
            "Start relevant conversations",
            "Create contacts, record their permission to email and organize them into lists. Review recipients before approving a campaign.",
            "contacts",
            "Manage contacts",
          ],
          [
            "04",
            "Keep opportunities moving",
            "Track deals, assign a stage, add follow-ups and review the next action for every opportunity.",
            "pipeline",
            "View pipeline",
          ],
          [
            "05",
            "Work together",
            "Invite teammates with the right role. Organization owners and admins manage permissions; platform support is separately audited.",
            "team",
            "Team & roles",
          ],
          [
            "06",
            "Connect live services",
            "Research, campaign delivery and paid billing need their respective service credentials. Availability is shown in Integrations.",
            "integrations",
            "Connection status",
          ],
        ].map(([number, title, description, path, label]) => (
          <article className="panel livePanel" key={number}>
            <small className="guideStep">{number}</small>
            <h2>{title}</h2>
            <p>{description}</p>
            <Link to={workspaceBase + "/" + path}>
              {label}
              <ArrowRight size={16} />
            </Link>
          </article>
        ))}
      </section>
    </>
  );
}
