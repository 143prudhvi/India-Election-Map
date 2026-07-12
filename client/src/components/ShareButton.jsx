import { useState } from 'react';

// Produces a public shareable link and an iframe embed snippet for the
// current map view. The links point at the public routes (/m, /embed),
// which only render data when the server has PUBLIC_ACCESS_ENABLED=true.
export default function ShareButton({ params }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState('');

  const qs = new URLSearchParams(params).toString();
  const origin = window.location.origin;
  const shareUrl = `${origin}/m?${qs}`;
  const embedUrl = `${origin}/embed?${qs}`;
  const embedCode = `<iframe src="${embedUrl}" width="640" height="520" style="border:0" title="India Election Map"></iframe>`;

  async function copy(text, which) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied(''), 1800);
    } catch {
      /* clipboard blocked — the text is selectable in the field */
    }
  }

  return (
    <div className="share-wrap">
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpen((v) => !v)}>
        Share
      </button>
      {open && (
        <>
          <div className="share-backdrop" onClick={() => setOpen(false)} />
          <div className="share-popover" role="dialog" aria-label="Share this map">
            <label className="label">Shareable link</label>
            <div className="share-row">
              <input className="input" readOnly value={shareUrl} onFocus={(e) => e.target.select()} />
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => copy(shareUrl, 'link')}>
                {copied === 'link' ? 'Copied' : 'Copy'}
              </button>
            </div>
            <label className="label">Embed</label>
            <div className="share-row">
              <textarea className="input share-embed" readOnly value={embedCode} onFocus={(e) => e.target.select()} />
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => copy(embedCode, 'embed')}>
                {copied === 'embed' ? 'Copied' : 'Copy'}
              </button>
            </div>
            <p className="legend-note">
              Public links work only when public access is enabled for this site.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
