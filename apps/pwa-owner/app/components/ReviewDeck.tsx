"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type ReviewDeckCard = {
  id: string;
  kind: "food" | "drink";
  name: string;
  price: number;
  imageUrl: string;
  okamiPitch: string;
  pairingHint: string;
};

type ReviewDeckProps = {
  cards: ReviewDeckCard[];
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
};

const SWIPE_THRESHOLD_PX = 90;

export default function ReviewDeck({ cards, onApprove, onReject }: ReviewDeckProps) {
  const [cursor, setCursor] = useState(0);
  const [offsetX, setOffsetX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startXRef = useRef<number | null>(null);
  const activePointerRef = useRef<number | null>(null);

  useEffect(() => {
    setCursor(0);
    setOffsetX(0);
    setDragging(false);
    startXRef.current = null;
    activePointerRef.current = null;
  }, [cards.length]);

  const current = cards[cursor] ?? null;
  const nextCards = useMemo(() => cards.slice(cursor + 1, cursor + 4), [cards, cursor]);

  function moveNext() {
    setCursor((prev) => Math.min(prev + 1, Math.max(0, cards.length)));
    setOffsetX(0);
    setDragging(false);
    startXRef.current = null;
    activePointerRef.current = null;
  }

  function decideSwipe(result: "approve" | "reject") {
    if (!current) {
      return;
    }
    if (result === "approve") {
      onApprove(current.id);
    } else {
      onReject(current.id);
    }
    moveNext();
  }

  function onPointerDown(event: React.PointerEvent<HTMLElement>) {
    if (!current) {
      return;
    }
    startXRef.current = event.clientX;
    activePointerRef.current = event.pointerId;
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: React.PointerEvent<HTMLElement>) {
    if (!dragging || startXRef.current === null || activePointerRef.current !== event.pointerId) {
      return;
    }
    setOffsetX(event.clientX - startXRef.current);
  }

  function onPointerUp(event: React.PointerEvent<HTMLElement>) {
    if (!dragging || activePointerRef.current !== event.pointerId) {
      return;
    }
    if (offsetX >= SWIPE_THRESHOLD_PX) {
      decideSwipe("approve");
      return;
    }
    if (offsetX <= -SWIPE_THRESHOLD_PX) {
      decideSwipe("reject");
      return;
    }
    setDragging(false);
    setOffsetX(0);
    startXRef.current = null;
    activePointerRef.current = null;
  }

  return (
    <section className="review-deck">
      <div className="review-deck-stack">
        {nextCards
          .slice()
          .reverse()
          .map((card, idx) => (
            <article
              key={card.id}
              className="review-deck-card preview"
              style={{
                transform: `translateY(${(idx + 1) * 8}px) scale(${1 - (idx + 1) * 0.03})`,
                zIndex: 5 - idx
              }}
            >
              <img src={card.imageUrl} alt={card.name} />
              <div className="review-deck-body">
                <p className="small">{card.kind.toUpperCase()}</p>
                <h3>{card.name}</h3>
                <p className="small">¥{card.price}</p>
              </div>
            </article>
          ))}
        {current ? (
          <article
            className="review-deck-card active"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            style={{
              transform: `translateX(${offsetX}px) rotate(${offsetX * 0.03}deg)`,
              zIndex: 10
            }}
          >
            <img src={current.imageUrl} alt={current.name} />
            <div className="review-deck-body">
              <p className="small">{current.kind.toUpperCase()}</p>
              <h3>{current.name}</h3>
              <p className="small">¥{current.price}</p>
              <p className="small">{current.okamiPitch}</p>
              {current.kind === "food" ? <p className="small">Pairing: {current.pairingHint}</p> : null}
            </div>
          </article>
        ) : (
          <article className="review-deck-card done">
            <div className="review-deck-body">
              <h3>Deck Completed</h3>
              <p className="small">All cards in this filter are reviewed.</p>
            </div>
          </article>
        )}
      </div>
      <div className="review-deck-actions">
        <button type="button" onClick={() => decideSwipe("reject")} disabled={!current}>
          Swipe Left (Reject)
        </button>
        <button type="button" onClick={() => decideSwipe("approve")} disabled={!current}>
          Swipe Right (Approve)
        </button>
      </div>
      <p className="small">
        card {Math.min(cursor + 1, cards.length)}/{cards.length} (threshold {SWIPE_THRESHOLD_PX}px)
      </p>
    </section>
  );
}
