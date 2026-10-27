import { Link } from "react-router-dom";
import CarHero from "../components/CarHero.jsx";

// The home page: the car, a short intro, and the three things you can do.
const OPTIONS = [
  {
    to: "/races",
    index: "01",
    title: "Compare lap times",
    body: "Pick a session and two drivers. Speed, throttle, braking, gears and the running gap, on a track map of who was faster where.",
    cta: "Choose a race",
  },
  {
    to: "/standings/drivers",
    index: "02",
    title: "Driver standings",
    body: "The drivers' championship after every round: points, gaps, wins, podiums, and how the title fight built up.",
    cta: "See the table",
  },
  {
    to: "/standings/constructors",
    index: "03",
    title: "Constructors' championship",
    body: "Every team's points race by race, who scored them, and how far each team is from the top.",
    cta: "See the teams",
  },
];

export default function Home() {
  return (
    <>
      <CarHero />
      <section className="hero home-intro">
        <h1>Where was the time won?</h1>
        <p className="lede">
          Real timing from every Formula 1 session since 2024. Compare any two laps, or follow both championships race by race.
        </p>
      </section>
      <ul className="options" aria-label="What you can do">
        {OPTIONS.map((o) => (
          <li key={o.to}>
            <Link to={o.to} className="option">
              <span className="option-index">{o.index}</span>
              <h2>{o.title}</h2>
              <p>{o.body}</p>
              <span className="option-cta">{o.cta} →</span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
