"use client";

interface TruncatedTextProps {
  text: string;
  maxLength?: number;
  className?: string;
}

export function TruncatedText({ text, maxLength = 50, className }: TruncatedTextProps) {
  if (text.length <= maxLength) {
    return <span className={className} title={text}>{text}</span>;
  }

  const keepChars = Math.floor((maxLength - 3) / 2);
  const truncated = `${text.slice(0, keepChars)}...${text.slice(-keepChars)}`;

  // Render truncated text with data attribute containing full text.
  // A global copy handler (TruncatedTextCopyHandler) intercepts copy events
  // and substitutes the full text when truncated elements are in the selection.
  return (
    <span className={className} title={text} data-full-text={text}>
      {truncated}
    </span>
  );
}
