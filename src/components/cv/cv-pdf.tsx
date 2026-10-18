import "server-only";
import { Document, Link, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { CvContent } from "@/lib/cv-schemas";

/**
 * Single-column, standard-font PDF (Helvetica) so it stays ATS-friendly and needs no font files.
 * Helvetica covers Latin-1 plus a few punctuation marks; anything else is dropped rather than
 * rendered as broken glyphs.
 */
const safe = (s: string) =>
  s.normalize("NFC").replace(/[^ -~ -ÿ–—‘’“”•…€™]/g, "");

const styles = StyleSheet.create({
  page: { paddingTop: 36, paddingBottom: 36, paddingHorizontal: 40, fontFamily: "Helvetica", fontSize: 9.5, color: "#111111", lineHeight: 1.35 },
  name: { fontSize: 20, fontFamily: "Helvetica-Bold", lineHeight: 1.2 },
  title: { fontSize: 11, marginTop: 4, color: "#333333" },
  contact: { flexDirection: "row", flexWrap: "wrap", marginTop: 4, color: "#333333" },
  contactItem: { marginRight: 10 },
  link: { color: "#111111", textDecoration: "underline" },
  headline: { marginTop: 8, fontFamily: "Helvetica-Bold", fontSize: 10.5 },
  section: { marginTop: 11 },
  sectionTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9.5,
    letterSpacing: 1,
    textTransform: "uppercase",
    borderBottomWidth: 0.75,
    borderBottomColor: "#111111",
    paddingBottom: 2,
    marginBottom: 5,
  },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  bold: { fontFamily: "Helvetica-Bold" },
  muted: { color: "#444444" },
  entry: { marginBottom: 6 },
  bullet: { flexDirection: "row", marginTop: 1.5, paddingLeft: 6 },
  bulletDot: { width: 9 },
  bulletText: { flex: 1 },
});

function Bullets({ items }: { items: string[] }) {
  return (
    <>
      {items.map((b, i) => (
        <View key={i} style={styles.bullet} wrap={false}>
          <Text style={styles.bulletDot}>{"•"}</Text>
          <Text style={styles.bulletText}>{safe(b)}</Text>
        </View>
      ))}
    </>
  );
}

export function CvPdfDocument({ content }: { content: CvContent }) {
  const { header } = content;
  const contact = [header.email, header.location].filter(Boolean);

  return (
    <Document title={safe(`${header.fullName} - CV`)} author={safe(header.fullName)}>
      <Page size="A4" style={styles.page}>
        <View>
          <Text style={styles.name}>{safe(header.fullName)}</Text>
          {header.title ? <Text style={styles.title}>{safe(header.title)}</Text> : null}
          <View style={styles.contact}>
            {contact.map((c) => (
              <Text key={c} style={styles.contactItem}>
                {safe(c)}
              </Text>
            ))}
            {header.links.map((l) => (
              <Link key={l.url} src={l.url} style={[styles.contactItem, styles.link]}>
                {safe(l.label)}
              </Link>
            ))}
          </View>
        </View>

        {content.headline ? <Text style={styles.headline}>{safe(content.headline)}</Text> : null}

        {content.summary ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Summary</Text>
            <Text>{safe(content.summary)}</Text>
          </View>
        ) : null}

        {content.skills.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Skills</Text>
            {content.skills.map((g, i) => (
              <Text key={i} style={{ marginBottom: 2 }}>
                <Text style={styles.bold}>{safe(g.group)}: </Text>
                {safe(g.items.join(", "))}
              </Text>
            ))}
          </View>
        ) : null}

        {content.experience.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Experience</Text>
            {content.experience.map((e, i) => (
              <View key={i} style={styles.entry}>
                <View style={styles.rowBetween} wrap={false}>
                  <Text style={styles.bold}>
                    {safe(e.role)} <Text style={styles.muted}>- {safe(e.company)}</Text>
                  </Text>
                  <Text style={styles.muted}>{safe(e.period)}</Text>
                </View>
                <Bullets items={e.bullets} />
              </View>
            ))}
          </View>
        ) : null}

        {content.projects.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Projects</Text>
            {content.projects.map((p, i) => (
              <View key={i} style={styles.entry}>
                <View style={styles.rowBetween} wrap={false}>
                  <Text style={styles.bold}>{safe(p.title)}</Text>
                  {p.liveLink ? (
                    <Link src={p.liveLink} style={[styles.muted, styles.link]}>
                      {safe(p.liveLink.replace(/^https?:\/\//, ""))}
                    </Link>
                  ) : null}
                </View>
                {p.technologies.length > 0 ? <Text style={styles.muted}>{safe(p.technologies.join(", "))}</Text> : null}
                <Bullets items={p.bullets} />
              </View>
            ))}
          </View>
        ) : null}

        {content.education.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Education</Text>
            {content.education.map((ed, i) => (
              <View key={i} style={styles.rowBetween} wrap={false}>
                <Text>
                  <Text style={styles.bold}>{safe(ed.qualification)}</Text> <Text style={styles.muted}>- {safe(ed.institution)}</Text>
                </Text>
                <Text style={styles.muted}>{safe(ed.period)}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </Page>
    </Document>
  );
}

/** Generated on demand from the saved CV JSON; nothing is stored. */
export function renderCvPdf(content: CvContent) {
  return renderToBuffer(<CvPdfDocument content={content} />);
}
