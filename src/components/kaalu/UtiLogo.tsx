import utiLogo from "@/assets/uti-logo.png.asset.json";

export function UtiLogo({ className = "h-8" }: { className?: string }) {
  return (
    <img
      src={utiLogo.url}
      alt="UTI AMC"
      className={`${className} w-auto object-contain select-none`}
      draggable={false}
    />
  );
}
