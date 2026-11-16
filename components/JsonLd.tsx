/**
 * Renders a schema.org JSON-LD block. Server component — the payload ships in
 * the HTML where crawlers read it, with no client-side JavaScript.
 */
export default function JsonLd({ data }: { data: object | object[] }) {
  // Escape `<` so a stray "</script>" inside content can't break out of the tag.
  const json = JSON.stringify(data).replace(/</g, "\\u003c");

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: json }}
    />
  );
}
