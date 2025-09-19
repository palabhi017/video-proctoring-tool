import React, { useEffect } from "react";

const VideoProctor = ({ stream, muted }) => {
  const ref = React.useRef(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted={!!muted}
      style={{ width: "100%", maxWidth: 640 }}
    />
  );
};

export default VideoProctor;
