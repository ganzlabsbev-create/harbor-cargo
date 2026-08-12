import Image from "next/image";

export default function Logo({ size = 40, className = "" }: { size?: number; className?: string }) {
  return (
    <Image
      src="/harbor-cargo.svg"
      alt="HARBOR CARGO"
      width={size}
      height={size}
      className={className}
      priority
    />
  );
}
