import type React from "react";

export function NukeDag(props: {
  script: string;
  className?: string;
  style?: React.CSSProperties;
  onSelectNode?: (node: null) => void;
}): React.JSX.Element {
  // Placeholder shell: `script` is not parsed or drawn yet.
  return (
    <div
      className={props.className}
      style={{
        width: "100%",
        height: "100%",
        background: "#1c1c1c",
        ...props.style,
      }}
    />
  );
}
