interface Props {
  className?: string;
}

export function AppTitle({ className = '' }: Props) {
  return (
    <h1
      className={`bg-linear-to-r from-accent to-purple-700 dark:to-purple-400 bg-clip-text text-4xl font-extrabold tracking-tight text-transparent ${className}`}
    >
      Video Meetings
    </h1>
  );
}
