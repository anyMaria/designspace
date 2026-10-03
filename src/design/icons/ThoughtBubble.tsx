import type { SVGProps } from 'react';

/** A thought bubble icon (24×24, stroke 1.75, round caps, like Lucide): a cloud with two small
 * circles trailing toward the bottom-left, i.e. toward the picture's corner. `filled` adds three
 * dots in the cloud to say "this has a description". */
export function ThoughtBubble({
  size = 20,
  filled = false,
  ...rest
}: { size?: number; filled?: boolean } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...rest}
    >
      <path d="M8.5 15.5h9a3.5 3.5 0 0 0 .5-6.96A5 5 0 0 0 8.4 7.1 4.25 4.25 0 0 0 8.5 15.5Z" />
      <circle cx="5.2" cy="18.6" r="1.5" />
      <circle cx="2.6" cy="21.6" r="0.9" />
      {filled && (
        <g fill="currentColor" stroke="none">
          <circle cx="10.6" cy="11.6" r="0.5" />
          <circle cx="13.4" cy="11.6" r="0.5" />
          <circle cx="16.2" cy="11.6" r="0.5" />
        </g>
      )}
    </svg>
  );
}
