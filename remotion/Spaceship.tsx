import { AbsoluteFill, Img, staticFile } from "remotion";
import type { Rocket } from "../src/config";
import { useCustomRocketImages } from "./rocket-color";

export const getSideRocketSource = (rocket: Rocket) => {
  if (rocket === "blue") {
    return staticFile("rocket-side-blue.png");
  }

  if (rocket === "orange") {
    return staticFile("rocket-side-orange.png");
  }

  return staticFile("rocket-side-yellow.png");
};

/** The side view, recoloured when a custom rocket colour is set. */
export const useSideRocketSource = (rocket: Rocket) =>
  useCustomRocketImages()?.side ?? getSideRocketSource(rocket);

export const RocketSide = (props: { readonly rocket: Rocket }) => {
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
