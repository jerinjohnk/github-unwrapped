import { AbsoluteFill, Img } from "remotion";
import type { Rocket } from "../../src/config";
import { useSideRocketSource } from "../Spaceship";

const SvgComponent = (props: { readonly rocket: Rocket }) => {
  const src = useSideRocketSource(props.rocket);
  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <Img
        src={src}
        style={{
          width: 732 / 2,
          height: 1574 / 2,
        }}
      />
    </AbsoluteFill>
  );
};

export default SvgComponent;
