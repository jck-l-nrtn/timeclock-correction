/** Montane Packaging wordmark (text). */
export function Brand({ subtitle }: { subtitle?: string }) {
  return (
    <span className="brand-wrap">
      <span className="brand-text">
        <span className="brand-name">Montane Packaging</span>
        {subtitle && <span className="brand-sub">{subtitle}</span>}
      </span>
    </span>
  );
}

/** Larger centered wordmark used above sign-in cards. */
export function BrandHero({ subtitle }: { subtitle?: string }) {
  return (
    <div className="brand-hero">
      <div className="brand-name">Montane Packaging</div>
      {subtitle && <div className="brand-sub">{subtitle}</div>}
    </div>
  );
}
