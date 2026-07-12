import { useState } from 'react';
import { createPortal } from 'react-dom';

// Shared fixed-position hover tooltip, portaled to <body> so overflow
// containers (.table-scroll, the sidebar) can never clip it.
export function useTip() {
  const [tip, setTip] = useState(null); // {x, y, content} | null

  const show = (content, e) => setTip({ x: e.clientX, y: e.clientY, content });
  const move = (e) => setTip((t) => (t ? { ...t, x: e.clientX, y: e.clientY } : t));
  const hide = () => setTip(null);

  const tipNode = tip
    ? createPortal(
        <div
          className="ui-tooltip"
          style={{
            left: Math.min(tip.x + 12, (window.innerWidth || 1200) - 270),
            top: tip.y + 14,
          }}
        >
          {tip.content}
        </div>,
        document.body
      )
    : null;

  return { show, move, hide, tipNode };
}
