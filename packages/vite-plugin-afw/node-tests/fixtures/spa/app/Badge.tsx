interface BadgeProps {
  label?: string;
}

const upper = (text: string): string => text.toUpperCase();

export default function Badge({ label = "typed" }: BadgeProps) {
  return <span id="badge">{upper(label)}</span>;
}
