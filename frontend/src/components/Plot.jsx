import { useEffect, useRef, useState } from "react";
import Plotly from "plotly.js-basic-dist-min";
import createPlotlyComponent from "react-plotly.js/factory";

const BasePlot = createPlotlyComponent(Plotly);

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export function baseLayout(extra = {}) {
  return {
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    font: { family: "Titillium Web, sans-serif", color: css("--text") || "#e8eaef", size: 12 },
    margin: { l: 56, r: 16, t: 8, b: 40 },
    showlegend: false,
    hoverlabel: { font: { family: "JetBrains Mono, monospace", size: 11 } },
    ...extra,
  };
}

export const plotConfig = { displayModeBar: false, responsive: true };

// Plotly sizes itself once on mount; track the container so the chart always fits it.
export default function Plot({ layout, ...props }) {
  const box = useRef(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = box.current;
    setWidth(el.clientWidth);
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={box} style={{ width: "100%", minWidth: 0 }}>
      {width > 0 && <BasePlot layout={{ ...layout, width }} {...props} />}
    </div>
  );
}
