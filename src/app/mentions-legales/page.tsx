/**
 * /mentions-legales — Mentions Légales (LCEN article 6-III).
 *
 * Obligation légale pour tout site éditeur professionnel :
 *  - Identité de l'éditeur (nom, SIRET, adresse, contact)
 *  - Directeur de publication
 *  - Hébergeur (à compléter selon déploiement)
 *  - Conception / développement
 *  - Propriété intellectuelle + conditions d'utilisation
 */

import type { Metadata } from "next";
import { LegalLayout, LegalSection, LegalTodo } from "@/components/legal/legal-layout";

export const metadata: Metadata = {
  title: "Mentions légales",
  description: "Mentions légales du site clochette-nails.fr — Éditeur, hébergeur, propriété intellectuelle.",
  alternates: { canonical: "/mentions-legales" },
};

const TOC = [
  { id: "editeur", label: "Éditeur du site" },
  { id: "directeur", label: "Directeur de la publication" },
  { id: "hebergeur", label: "Hébergeur" },
  { id: "conception", label: "Conception et développement" },
  { id: "propriete", label: "Propriété intellectuelle" },
  { id: "utilisation", label: "Conditions d'utilisation" },
  { id: "donnees", label: "Données personnelles" },
  { id: "cookies", label: "Cookies" },
  { id: "liens", label: "Liens externes" },
  { id: "credits", label: "Crédits visuels" },
];

export default function MentionsLegalesPage() {
  return (
    <LegalLayout title="Mentions légales" lastUpdate="13 mai 2026" toc={TOC}>
      <LegalSection id="editeur" title="1. Éditeur du site">
        <p>
          Le site <a href="https://www.clochette-nails.fr">www.clochette-nails.fr</a> est
          édité par :
        </p>
        <p>
          <strong>Clochette Nails</strong>
          <br />
          Forme juridique : Entrepreneur Individuel <LegalTodo>[à confirmer]</LegalTodo>
          <br />
          SIRET : <LegalTodo>[à compléter — 14 chiffres]</LegalTodo>
          <br />
          Code APE : <LegalTodo>[à compléter — typiquement 9602B « Soins de beauté »]</LegalTodo>
          <br />
          Numéro TVA intracommunautaire : Non applicable (franchise en base de TVA)
          <br />
          Adresse : <LegalTodo>[à compléter]</LegalTodo>, 79320 Moncoutant-sur-Sèvre, France
          <br />
          Téléphone : <a href="tel:0688686699">06 88 68 66 99</a>
          <br />
          Email : <a href="mailto:contact@clochette-nails.fr">contact@clochette-nails.fr</a>
        </p>
      </LegalSection>

      <LegalSection id="directeur" title="2. Directeur de la publication">
        <p>
          <LegalTodo>[Nom et prénom de la dirigeante à compléter]</LegalTodo>, en
          qualité de propriétaire-gérante de Clochette Nails.
        </p>
        <p>
          Contact : <a href="mailto:contact@clochette-nails.fr">contact@clochette-nails.fr</a>
        </p>
      </LegalSection>

      <LegalSection id="hebergeur" title="3. Hébergeur">
        <p>
          Le site est hébergé par :
        </p>
        <p>
          <LegalTodo>[À compléter selon hébergeur choisi]</LegalTodo>
        </p>
        <p>
          Exemples typiques (à remplacer par le nom du vrai hébergeur) :
        </p>
        <ul>
          <li>
            <strong>Vercel Inc.</strong>, 340 S Lemon Ave #4133, Walnut, CA 91789, USA — <a href="https://vercel.com" target="_blank" rel="noopener noreferrer">vercel.com</a>
          </li>
          <li>
            <strong>OVH SAS</strong>, 2 rue Kellermann, 59100 Roubaix, France — <a href="https://www.ovhcloud.com" target="_blank" rel="noopener noreferrer">ovhcloud.com</a>
          </li>
          <li>
            <strong>Hostinger International Ltd.</strong>, 61 Lordou Vironos Street, 6023 Larnaca, Chypre
          </li>
        </ul>
      </LegalSection>

      <LegalSection id="conception" title="4. Conception et développement">
        <p>
          Conception graphique, design et développement réalisés par{" "}
          <LegalTodo>[Damien Girard / nom à confirmer]</LegalTodo>.
        </p>
      </LegalSection>

      <LegalSection id="propriete" title="5. Propriété intellectuelle">
        <p>
          L&apos;ensemble des éléments présents sur ce site (textes, images,
          photographies, logo, charte graphique, structure, mises en forme) est
          la propriété exclusive de Clochette Nails ou de ses partenaires, et
          est protégé par les lois françaises et internationales relatives à la
          propriété intellectuelle.
        </p>
        <p>
          Toute reproduction, représentation, modification, publication,
          adaptation ou exploitation, totale ou partielle, des éléments du
          site, quel que soit le moyen ou le procédé utilisé, est interdite
          sans autorisation écrite préalable de Clochette Nails.
        </p>
        <p>
          Toute exploitation non autorisée est susceptible d&apos;entraîner des
          poursuites pour contrefaçon, conformément aux articles L335-2 et
          suivants du Code de la propriété intellectuelle.
        </p>
      </LegalSection>

      <LegalSection id="utilisation" title="6. Conditions d'utilisation">
        <p>
          L&apos;utilisation du site implique l&apos;acceptation pleine et
          entière des présentes mentions légales. Clochette Nails se réserve le
          droit de modifier ces mentions à tout moment, sans préavis.
        </p>
        <p>
          Clochette Nails s&apos;efforce de maintenir le site accessible 24h/24
          et 7j/7, mais ne garantit pas une disponibilité absolue. Le site peut
          être interrompu pour maintenance technique sans préavis. Clochette
          Nails ne saurait être tenue responsable de tout dommage direct ou
          indirect lié à l&apos;utilisation ou à l&apos;indisponibilité du site.
        </p>
      </LegalSection>

      <LegalSection id="donnees" title="7. Données personnelles">
        <p>
          Les modalités de collecte, de traitement et de protection des
          données personnelles sont décrites dans la{" "}
          <a href="/confidentialite">Politique de Confidentialité</a>.
        </p>
      </LegalSection>

      <LegalSection id="cookies" title="8. Cookies">
        <p>
          L&apos;utilisation des cookies sur ce site est régie par notre
          politique en matière de cookies, accessible via le bandeau de
          consentement présent en bas de page lors de votre première visite.
        </p>
      </LegalSection>

      <LegalSection id="liens" title="9. Liens externes">
        <p>
          Le site peut contenir des liens vers des sites tiers (Instagram,
          Stripe, médiateur de la consommation…). Clochette Nails n&apos;exerce
          aucun contrôle sur ces sites et décline toute responsabilité quant à
          leur contenu, leur fonctionnement ou leurs propres conditions
          d&apos;utilisation.
        </p>
      </LegalSection>

      <LegalSection id="credits" title="10. Crédits visuels">
        <p>
          Les photographies présentes sur le site sont la propriété de
          Clochette Nails. Tout usage non autorisé est interdit.
        </p>
        <p>
          Polices typographiques utilisées : Cinzel, Julius Sans One, Inria
          Serif, Manrope — distribuées sous licence libre via Google Fonts.
        </p>
        <p>
          Icônes : Lucide (licence ISC libre).
        </p>
      </LegalSection>
    </LegalLayout>
  );
}
