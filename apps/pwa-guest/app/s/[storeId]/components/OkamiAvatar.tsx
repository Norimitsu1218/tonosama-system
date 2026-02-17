"use client";

type OkamiAvatarStatus = "idle" | "thinking" | "speaking";

type OkamiAvatarProps = {
  status: OkamiAvatarStatus;
};

export default function OkamiAvatar({ status }: OkamiAvatarProps) {
  return (
    <div className="okami-avatar" aria-live="polite">
      <div className={`okami-sprite is-${status}`} aria-hidden="true">
        <span className="okami-eye okami-eye-left" />
        <span className="okami-eye okami-eye-right" />
        <span className="okami-mouth" />
      </div>
      <p className="small">Okami: {status}</p>
    </div>
  );
}
