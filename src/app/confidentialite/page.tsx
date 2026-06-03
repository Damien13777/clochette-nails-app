/**
 * /confidentialite — Politique de Confidentialité (RGPD).
 *
 * Couvre :
 *  - Responsable de traitement
 *  - Données collectées par le site (booking + contact + newsletter)
 *  - Stripe en tant que sous-traitant
 *  - Hébergeur (à compléter selon déploiement)
 *  - Durées légales : 3 ans bookings, 5 ans facturation
 *  - Droits RGPD : accès, rectification, suppression, opposition, portabilité
 *  - Cookies (renvoi vers cookie banner)
 *  - Recours CNIL
 */

import type { Metadata } from "next";
import { LegalLayout, LegalSection } from "@/components/legal/legal-layout";

export const metadata: Metadata = {
  title: "Politique de Confidentialité",
  description:
    "Politique de confidentialité — Traitement RGPD des données personnelles sur clochette-nails.fr.",
  alternates: { canonical: "/confidentialite" },
};

const TOC = [
  { id: "preambule", label: "Préambule" },
  { id: "responsable", label: "Responsable du traitement" },
  { id: "donnees", label: "Données collectées" },
  { id: "finalites", label: "Finalités du traitement" },
  { id: "bases", label: "Bases légales" },
  { id: "destinataires", label: "Destinataires" },
  { id: "conservation", label: "Durée de conservation" },
  { id: "transferts", label: "Transferts hors UE" },
  { id: "securite", label: "Sécurité" },
  { id: "cookies", label: "Cookies" },
  { id: "droits", label: "Vos droits" },
  { id: "exercice", label: "Exercice des droits" },
  { id: "cnil", label: "Recours CNIL" },
];

export default function ConfidentialitePage() {
  return (
    <LegalLayout
      title="Politique de Confidentialité"
      lastUpdate="3 juin 2026"
      toc={TOC}
    >
      <LegalSection id="preambule" title="1. Préambule">
        <p>
          Clochette Nails accorde une grande importance à la protection de vos
          données personnelles. La présente Politique de Confidentialité décrit
          les modalités selon lesquelles vos données sont collectées,
          traitées, conservées et protégées, conformément au Règlement Général
          sur la Protection des Données (RGPD - UE 2016/679) et à la loi
          « Informatique et Libertés » du 6 janvier 1978 modifiée.
        </p>
      </LegalSection>

      <LegalSection id="responsable" title="2. Responsable du traitement">
        <p>
          <strong>Clochette Nails</strong> — Chloé Girard
          <br />
          Forme juridique : Entreprise individuelle (EI)
          <br />
          SIRET : 889 014 155 00036
          <br />
          Adresse : 1, lieu-dit La Cournolière, 79320 Moncoutant-sur-Sèvre
          <br />
          Contact RGPD : <a href="mailto:contact@clochette-nails.fr">contact@clochette-nails.fr</a>
        </p>
        <p>
          Compte tenu de la taille de la structure (entreprise individuelle),
          aucun Délégué à la Protection des Données (DPO) n&apos;est désigné.
          Toute question relative à vos données peut être adressée à
          l&apos;adresse ci-dessus.
        </p>
      </LegalSection>

      <LegalSection id="donnees" title="3. Données collectées">
        <p>
          Nous collectons uniquement les données strictement nécessaires aux
          finalités décrites ci-dessous (principe de minimisation).
        </p>
        <p><strong>Lors de la réservation d&apos;un rendez-vous :</strong></p>
        <ul>
          <li>Identité : prénom, nom</li>
          <li>Contact : email, numéro de téléphone</li>
          <li>Message libre (optionnel) : inspirations, contraintes</li>
          <li>Prestation choisie, options, date et heure du créneau</li>
          <li>Montant de l&apos;acompte et statut du paiement</li>
          <li>Adresse IP et user-agent (logs techniques temporaires)</li>
        </ul>
        <p><strong>Lors d&apos;une demande de contact via le site :</strong></p>
        <ul>
          <li>Nom, email, téléphone (optionnel), objet et message</li>
        </ul>
        <p><strong>Lors d&apos;une inscription à la newsletter :</strong></p>
        <ul>
          <li>Adresse email uniquement</li>
          <li>Date et adresse IP de la saisie (preuve de consentement RGPD)</li>
          <li>Source d&apos;inscription (formulaire footer, blog, achat ebook…) à des fins statistiques internes</li>
        </ul>
        <p className="text-sm text-[var(--color-ink-700)]">
          L&apos;inscription suit un mécanisme de <strong>double opt-in</strong> conforme aux recommandations de la CNIL :
          tant que vous ne cliquez pas sur le lien de confirmation envoyé dans votre boîte mail,
          votre inscription n&apos;est pas finalisée et aucun email commercial ne vous est adressé.
        </p>
        <p><strong>Lors de l&apos;envoi de chaque campagne newsletter :</strong></p>
        <ul>
          <li>Statut de remise de l&apos;email (envoyé, livré, ouvert, cliqué, bounce, plainte spam)</li>
          <li>Horodatage de la première ouverture et du premier clic, nombre total d&apos;ouvertures et de clics</li>
        </ul>
        <p className="text-sm text-[var(--color-ink-700)]">
          Ces données comportementales sont collectées via notre prestataire d&apos;envoi
          <strong> Resend</strong> (pixel de tracking et liens taggués). Elles servent uniquement à
          mesurer la pertinence de nos communications et améliorer leur contenu. Aucun profilage
          publicitaire n&apos;est effectué, et ces données ne sont jamais cédées à un tiers.
        </p>
        <p><strong>Lors de l&apos;achat d&apos;un ebook :</strong></p>
        <ul>
          <li>Identité acheteuse : prénom, nom, email</li>
          <li>Statut de la commande et date de téléchargement</li>
          <li>Token de téléchargement nominatif (URL signée, expirable)</li>
        </ul>
        <p><strong>Lors de l&apos;achat ou de l&apos;utilisation d&apos;une carte cadeau :</strong></p>
        <ul>
          <li>Identité de l&apos;acheteuse : prénom, nom, email, téléphone</li>
          <li>Identité du bénéficiaire (optionnel) : prénom, email</li>
          <li>Message personnalisé éventuel</li>
          <li>Date d&apos;envoi programmée le cas échéant</li>
          <li>Historique d&apos;utilisation (montants débités, date, prestation associée)</li>
        </ul>
        <p>
          <strong>Données de paiement :</strong> les coordonnées bancaires ne
          sont jamais collectées ni stockées par Clochette Nails. Elles sont
          traitées exclusivement par <strong>Stripe</strong>, prestataire
          certifié PCI-DSS niveau 1.
        </p>
      </LegalSection>

      <LegalSection id="finalites" title="4. Finalités du traitement">
        <ul>
          <li><strong>Gestion des réservations</strong> : confirmer, suivre, modifier ou annuler un rendez-vous.</li>
          <li><strong>Encaissement de l&apos;acompte et des achats</strong> : facturation et paiement via Stripe.</li>
          <li><strong>Communication transactionnelle</strong> : email de confirmation, rappel J-1, suivi post-RDV.</li>
          <li><strong>Délivrance des ebooks</strong> : envoi du lien de téléchargement sécurisé après paiement, gestion des accès et tokens.</li>
          <li><strong>Émission et gestion des cartes cadeau</strong> : génération du code, envoi au bénéficiaire, suivi de l&apos;utilisation, contrôle de validité.</li>
          <li><strong>Réponse à vos demandes</strong> : traitement des messages adressés via le formulaire de contact.</li>
          <li><strong>Newsletter</strong> (si vous y êtes abonnée) : envoi d&apos;informations commerciales, mesure d&apos;engagement (taux d&apos;ouverture / de clic agrégés) et segmentation simple par source d&apos;inscription ou ancienneté pour adapter la fréquence et le contenu.</li>
          <li><strong>Obligations légales</strong> : conservation des factures à des fins comptables et fiscales.</li>
        </ul>
      </LegalSection>

      <LegalSection id="bases" title="5. Bases légales">
        <ul>
          <li><strong>Exécution du contrat</strong> (article 6.1.b RGPD) : pour la gestion des réservations et le paiement.</li>
          <li><strong>Obligation légale</strong> (article 6.1.c RGPD) : pour la conservation comptable des factures.</li>
          <li><strong>Intérêt légitime</strong> (article 6.1.f RGPD) : pour la prévention de la fraude et la sécurité du site.</li>
          <li><strong>Consentement</strong> (article 6.1.a RGPD) : pour la newsletter et les cookies non strictement nécessaires.</li>
        </ul>
      </LegalSection>

      <LegalSection id="destinataires" title="6. Destinataires des données">
        <p>
          Vos données sont accessibles exclusivement par la dirigeante de
          Clochette Nails. Elles peuvent être transmises aux destinataires
          suivants, dans la stricte limite de leurs missions :
        </p>
        <ul>
          <li><strong>Stripe Payments Europe Ltd.</strong> (sous-traitant paiement) : <a href="https://stripe.com/fr/privacy" target="_blank" rel="noopener noreferrer">stripe.com/fr/privacy</a></li>
          <li><strong>Resend Inc.</strong> (sous-traitant email transactionnel) : <a href="https://resend.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer">resend.com/legal/privacy-policy</a></li>
          <li><strong>Hébergeur du site</strong> : Hostinger International Ltd. (Larnaca, Chypre) — <a href="https://www.hostinger.fr" target="_blank" rel="noopener noreferrer">hostinger.fr</a></li>
          <li><strong>Comptable / expert-comptable</strong> : pour les obligations légales (factures).</li>
          <li><strong>Autorités administratives ou judiciaires</strong> : sur réquisition légale uniquement.</li>
        </ul>
        <p>
          Vos données ne sont jamais vendues, louées ou cédées à des tiers à
          des fins commerciales.
        </p>
      </LegalSection>

      <LegalSection id="conservation" title="7. Durée de conservation">
        <ul>
          <li><strong>Données de réservation</strong> : 3 ans à compter du dernier rendez-vous, à des fins de gestion de la relation client.</li>
          <li><strong>Factures et documents comptables</strong> : 10 ans (obligation légale article L123-22 Code de commerce).</li>
          <li><strong>Achats d&apos;ebooks et tokens de téléchargement</strong> : 3 ans à compter de la dernière utilisation, puis archivage anonymisé pour comptabilité.</li>
          <li><strong>Cartes cadeau</strong> : durée de validité (12 mois) + 3 ans pour conservation de l&apos;historique d&apos;utilisation et obligations comptables.</li>
          <li><strong>Logs techniques (IP, user-agent)</strong> : 13 mois maximum (recommandation CNIL).</li>
          <li><strong>Demandes de contact</strong> : 3 ans à compter du dernier échange.</li>
          <li><strong>Newsletter</strong> : jusqu&apos;à votre désinscription. Le lien de désinscription figure dans chaque email et fonctionne en un clic, sans connexion. Tout signalement spam (« mark as spam » dans votre boîte mail) entraîne également une désinscription automatique immédiate.</li>
          <li><strong>Statistiques de campagnes newsletter</strong> (ouvertures, clics) : conservées tant que vous êtes abonnée, supprimées avec votre profil en cas de désinscription.</li>
          <li><strong>Cookies</strong> : 13 mois maximum (durée légale CNIL).</li>
        </ul>
      </LegalSection>

      <LegalSection id="transferts" title="8. Transferts hors Union européenne">
        <p>
          Vos données sont principalement stockées et traitées au sein de
          l&apos;Union européenne. Certains sous-traitants techniques (Stripe,
          Resend) peuvent occasionnellement transférer des données vers les
          États-Unis dans le cadre du Data Privacy Framework
          UE/États-Unis ou de Clauses Contractuelles Types validées par la
          Commission européenne, garantissant un niveau de protection
          équivalent au RGPD.
        </p>
      </LegalSection>

      <LegalSection id="securite" title="9. Sécurité">
        <p>
          Nous mettons en œuvre les mesures techniques et organisationnelles
          appropriées pour protéger vos données : chiffrement HTTPS/TLS,
          authentification forte pour l&apos;accès administrateur, sauvegardes
          régulières, hébergement européen.
        </p>
      </LegalSection>

      <LegalSection id="cookies" title="10. Cookies">
        <p>
          Le site utilise des cookies à des fins strictement nécessaires au
          fonctionnement (session, authentification, sécurité). Les cookies
          tiers (paiement Stripe) sont déposés uniquement après votre
          consentement via le bandeau dédié.
        </p>
        <p>
          Vous pouvez à tout moment modifier vos préférences depuis le bandeau
          ou paramétrer votre navigateur pour bloquer les cookies.
        </p>
      </LegalSection>

      <LegalSection id="droits" title="11. Vos droits">
        <p>
          Conformément au RGPD, vous disposez à tout moment des droits suivants
          sur vos données personnelles :
        </p>
        <ul>
          <li><strong>Droit d&apos;accès</strong> : obtenir confirmation que vos données sont traitées et en recevoir copie.</li>
          <li><strong>Droit de rectification</strong> : faire corriger des données inexactes ou incomplètes.</li>
          <li><strong>Droit d&apos;effacement</strong> (« droit à l&apos;oubli ») : demander la suppression de vos données, sous réserve des obligations légales de conservation.</li>
          <li><strong>Droit à la limitation</strong> du traitement.</li>
          <li><strong>Droit à la portabilité</strong> : recevoir vos données dans un format structuré et couramment utilisé.</li>
          <li><strong>Droit d&apos;opposition</strong> au traitement, notamment à des fins de prospection.</li>
          <li><strong>Droit de retirer votre consentement</strong> à tout moment (newsletter notamment).</li>
          <li><strong>Droit de définir des directives</strong> relatives au sort de vos données après votre décès.</li>
        </ul>
      </LegalSection>

      <LegalSection id="exercice" title="12. Exercice des droits">
        <p>
          Pour exercer l&apos;un de ces droits, contactez-nous à{" "}
          <a href="mailto:contact@clochette-nails.fr">contact@clochette-nails.fr</a>{" "}
          en précisant votre demande et en joignant une copie d&apos;une pièce
          d&apos;identité (afin de prévenir toute usurpation).
        </p>
        <p>
          Nous nous engageons à répondre dans un délai d&apos;un mois, qui peut
          être prolongé de deux mois pour les demandes complexes ou nombreuses
          (vous serez alors informée de ce délai et de ses motifs).
        </p>
      </LegalSection>

      <LegalSection id="cnil" title="13. Recours CNIL">
        <p>
          Si vous estimez, après nous avoir contactés, que vos droits ne sont
          pas respectés, vous pouvez introduire une réclamation auprès de la
          Commission Nationale de l&apos;Informatique et des Libertés (CNIL) :
        </p>
        <p>
          <strong>CNIL</strong>
          <br />
          3 Place de Fontenoy, TSA 80715, 75334 Paris Cedex 07
          <br />
          Téléphone : 01 53 73 22 22
          <br />
          Site web :{" "}
          <a href="https://www.cnil.fr" target="_blank" rel="noopener noreferrer">
            www.cnil.fr
          </a>
        </p>
      </LegalSection>
    </LegalLayout>
  );
}
