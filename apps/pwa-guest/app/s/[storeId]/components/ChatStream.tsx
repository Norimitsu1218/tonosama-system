"use client";

type ChatMessage = {
  id: string;
  role: "user" | "okami";
  label?: string;
  text: string;
};

type ChatStreamProps = {
  messages: ChatMessage[];
  input: string;
  notice?: string | null;
  presets: string[];
  onInputChange: (value: string) => void;
  onSubmit: () => void;
  onPreset: (preset: string) => void;
};

export default function ChatStream({
  messages,
  input,
  notice,
  presets,
  onInputChange,
  onSubmit,
  onPreset
}: ChatStreamProps) {
  return (
    <div className="chat-stream">
      <div className="chat-log" data-testid="chat-log">
        {messages.length === 0 ? <p className="small">Ask Okami anything about this store.</p> : null}
        {messages.map((message) => (
          <div key={message.id} className={`chat-row is-${message.role}`}>
            <p className="chat-role">{message.role === "user" ? "You" : `Okami ${message.label ? `[${message.label}]` : ""}`}</p>
            <p className="chat-bubble">{message.text}</p>
          </div>
        ))}
      </div>
      <div className="chat-presets">
        {presets.map((preset) => (
          <button key={preset} className="btn btn-quiet" type="button" onClick={() => onPreset(preset)}>
            {preset}
          </button>
        ))}
      </div>
      <div className="chat-input-row">
        <input
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
          placeholder="Ask Okami..."
          className="okami-input"
          data-testid="okami-input"
          onKeyDown={(e) => {
            if (e.key !== "Enter") {
              return;
            }
            e.preventDefault();
            onSubmit();
          }}
        />
        <button className="btn" type="button" onClick={onSubmit} data-testid="okami-ask-button">
          Ask
        </button>
      </div>
      {notice ? <p className="small caution">{notice}</p> : null}
    </div>
  );
}
