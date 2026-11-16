"use client";

import { useState } from "react";
import styles from "./Faq.module.css";

export interface FaqItem {
  q: string;
  a: string;
}

export default function Faq({ items }: { items: readonly FaqItem[] }) {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <div className={styles.list}>
      {items.map((item, i) => {
        const isOpen = open === i;
        return (
          <div key={item.q} className={styles.item}>
            <button
              className={styles.trigger}
              aria-expanded={isOpen}
              onClick={() => setOpen(isOpen ? null : i)}
            >
              <span>{item.q}</span>
              <span className={styles.sign} data-open={isOpen} aria-hidden="true">
                +
              </span>
            </button>
            {isOpen && <p className={styles.answer}>{item.a}</p>}
          </div>
        );
      })}
    </div>
  );
}
