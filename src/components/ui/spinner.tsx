"use client";

interface SpinnerProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeStyles = {
  sm: "h-3 w-3",
  md: "h-4 w-4",
  lg: "h-6 w-6",
};

export function Spinner({ size = "md", className = "" }: SpinnerProps) {
  return (
    <span
      className={`
        inline-block animate-spin border-2 border-current border-t-transparent rounded-full
        ${sizeStyles[size]}
        ${className}
      `}
    />
  );
}
