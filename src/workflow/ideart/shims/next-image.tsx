import type { ImgHTMLAttributes } from "react";

type NextImageProps = ImgHTMLAttributes<HTMLImageElement> & {
  fill?: boolean;
  priority?: boolean;
  unoptimized?: boolean;
};

export default function Image({
  fill,
  priority: _priority,
  unoptimized: _unoptimized,
  style,
  ...props
}: NextImageProps) {
  // eslint-disable-next-line jsx-a11y/alt-text
  return (
    <img
      {...props}
      style={
        fill
          ? { position: "absolute", width: "100%", height: "100%", ...style }
          : style
      }
    />
  );
}
