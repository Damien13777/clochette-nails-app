/**
 * /cgv — Conditions Générales de Vente.
 *
 * Standard salon prothésie ongulaire en France :
 *  - Prestation en personne (pas de droit de rétractation pour services consommés)
 *  - Acompte 30% via Stripe (configurable admin)
 *  - Annulation 72h avant, sinon acompte conservé
 *  - Médiateur conso à compléter
 *
 * À VALIDER : avocat ou texte type pour cas spécifiques (CGV salon avec ebook/gift card).
 */

import type { Metadata } from "next";
import Link from "next/link";
import { LegalLayout, LegalSection, LegalTodo } from "@/components/legal/legal-layout";

export const metadata: Metadata = {
  title: "Conditions Générales de Vente",
  description:
    "Conditions Générales de Vente — Clochette Nails, prestations de prothésie ongulaire à Moncoutant-sur-Sèvre.",
  alternates: { canonical: "/cgv" },
};

const TOC = [
  { id: "preambule", label: "Préambule" },
  { id: "identification", label: "Identification du prestataire" },
  { id: "definitions", label: "Définitions" },
  { id: "acceptation", label: "Acceptation des CGV" },
  { id: "prestations", label: "Prestations en salon" },
  { id: "reservation", label: "Réservation et acompte" },
  { id: "ebooks", label: "Vente d'ebooks (biens numériques)" },
  { id: "cartes-cadeau", label: "Cartes cadeau" },
  { id: "paiement", label: "Modalités de paiement" },
  { id: "tarifs", label: "Tarifs" },
  { id: "annulation", label: "Annulation et remboursement (prestations)" },
  { id: "retractation", label: "Droit de rétractation" },
  { id: "responsabilite", label: "Responsabilité" },
  { id: "donnees", label: "Données personnelles" },
  { id: "propriete", label: "Propriété intellectuelle" },
  { id: "litiges", label: "Droit applicable et litiges" },
  { id: "mediateur", label: "Médiateur de la consommation" },
];

export default function CGVPage() {
  return (
    <LegalLayout
      title="Conditions Générales de Vente"
      lastUpdate="3 juin 2026"
      toc={TOC}
    >
      <LegalSection id="preambule" title="1. Préambule">
        <p>
          Les présentes Conditions Générales de Vente (ci-après « CGV »)
          régissent l&apos;ensemble des relations contractuelles entre le salon
          <strong> Clochette Nails</strong> (ci-après « le Prestataire ») et
          toute personne physique majeure réservant une prestation via le site{" "}
          <a href="https://www.clochette-nails.fr">www.clochette-nails.fr</a>{" "}
          (ci-après « la Cliente »).
        </p>
        <p>
          Toute réservation effectuée sur le site emporte l&apos;adhésion sans
          réserve aux présentes CGV. Le Prestataire se réserve le droit
          d&apos;adapter ou de modifier à tout moment les présentes CGV. En cas
          de modification, les CGV applicables sont celles en vigueur à la date
          de la réservation.
        </p>
      </LegalSection>

      <LegalSection id="identification" title="2. Identification du prestataire">
        <p>
          <strong>Clochette Nails</strong> — Chloé Girard
          <br />
          Forme juridique : Entreprise individuelle (EI)
          <br />
          SIRET : 889 014 155 00036
          <br />
          Siège social : 1, lieu-dit La Cournolière, 79320 Moncoutant-sur-Sèvre, France
          <br />
          Email : <a href="mailto:contact@clochette-nails.fr">contact@clochette-nails.fr</a>
          <br />
          Téléphone : <a href="tel:0688686699">06 88 68 66 99</a>
        </p>
      </LegalSection>

      <LegalSection id="definitions" title="3. Définitions">
        <ul>
          <li><strong>« Prestation »</strong> : tout service de prothésie ongulaire, soin des mains/pieds ou nail-art proposé par le Prestataire.</li>
          <li><strong>« Cliente »</strong> : toute personne physique majeure ayant capacité juridique réservant une Prestation.</li>
          <li><strong>« Réservation »</strong> : acte par lequel la Cliente choisit une Prestation, un créneau et confirme l&apos;ensemble par le paiement de l&apos;acompte.</li>
          <li><strong>« Acompte »</strong> : somme versée par la Cliente à la réservation pour bloquer le créneau choisi.</li>
        </ul>
      </LegalSection>

      <LegalSection id="acceptation" title="4. Acceptation des CGV">
        <p>
          La validation de la réservation par la Cliente vaut acceptation pleine
          et entière des présentes CGV, dont elle reconnaît avoir pris
          connaissance préalablement. La case « J&apos;accepte les conditions
          générales » du formulaire de réservation doit être cochée pour
          finaliser la réservation.
        </p>
      </LegalSection>

      <LegalSection id="prestations" title="5. Prestations en salon">
        <p>
          Le Prestataire propose des prestations de prothésie ongulaire
          réalisées en cabine privée à son adresse de siège. Le détail des
          prestations (durée, options, contenu) est consultable sur la{" "}
          <Link href="/prestations">page Prestations</Link> du site.
        </p>
        <p>
          Le Prestataire se réserve le droit de refuser une Prestation pour
          motif légitime, notamment : ongles abîmés nécessitant un soin
          préalable, allergie déclarée non compatible, comportement inapproprié.
          En pareil cas, l&apos;acompte est intégralement remboursé.
        </p>
      </LegalSection>

      <LegalSection id="reservation" title="6. Réservation et acompte">
        <p>
          La réservation s&apos;effectue exclusivement en ligne via le
          formulaire de réservation. La Cliente sélectionne une prestation, une
          ou plusieurs options éventuelles, puis un créneau disponible.
        </p>
        <p>
          La confirmation du créneau est subordonnée au versement d&apos;un{" "}
          <strong>acompte</strong> dont le montant correspond à un pourcentage
          du tarif total de la Prestation (par défaut 30 %). Ce montant est
          indiqué clairement avant validation du paiement.
        </p>
        <p>
          La réservation est ferme et définitive à réception de la confirmation
          de paiement de l&apos;acompte. Un email de confirmation est adressé à
          la Cliente.
        </p>
      </LegalSection>

      <LegalSection id="ebooks" title="7. Vente d'ebooks (biens numériques)">
        <p>
          Le Prestataire propose à la vente des ebooks (guides, tutoriels)
          accessibles depuis la page <Link href="/ebooks">Ebooks</Link> du site.
        </p>
        <p><strong>7.1. Modalités de commande</strong></p>
        <p>
          La commande d&apos;un ebook s&apos;effectue en ligne. Le paiement
          intégral est dû à la commande, par carte bancaire via Stripe.
          Aucune commande n&apos;est validée sans paiement complet.
        </p>
        <p><strong>7.2. Délivrance</strong></p>
        <p>
          Après confirmation du paiement, la Cliente reçoit immédiatement par
          email un lien sécurisé de téléchargement. Ce lien est personnel,
          nominatif et limité dans le temps. En cas de difficulté de
          téléchargement, la Cliente peut contacter le Prestataire dans un
          délai de 30 jours pour régénération du lien.
        </p>
        <p><strong>7.3. Licence d&apos;utilisation</strong></p>
        <p>
          L&apos;achat d&apos;un ebook confère à la Cliente une licence
          d&apos;utilisation strictement personnelle, non transmissible. Sont
          notamment interdits, sans autorisation écrite préalable :
        </p>
        <ul>
          <li>la reproduction totale ou partielle, par tout moyen ;</li>
          <li>le partage du fichier ou du lien de téléchargement à des tiers ;</li>
          <li>la revente, location, prêt ou diffusion publique ;</li>
          <li>la modification du contenu ;</li>
          <li>l&apos;utilisation à des fins commerciales ou pédagogiques (formation rémunérée).</li>
        </ul>
        <p>
          Tout manquement engage la responsabilité de la Cliente au titre des
          articles L335-2 et suivants du Code de la propriété intellectuelle.
        </p>
        <p><strong>7.4. Renoncement au droit de rétractation</strong></p>
        <p>
          Conformément à l&apos;article L221-28 13° du Code de la consommation,
          la fourniture d&apos;un contenu numérique non fourni sur un support
          matériel exclut le droit de rétractation dès lors que la Cliente a
          donné son <strong>accord préalable exprès</strong> au démarrage de
          la prestation avant l&apos;expiration du délai de rétractation, et a
          reconnu y renoncer.
        </p>
        <p>
          En validant l&apos;achat de l&apos;ebook, la Cliente reconnaît
          expressément renoncer à son droit de rétractation et accepter la
          délivrance immédiate du fichier.
        </p>
        <p><strong>7.5. Garantie de conformité</strong></p>
        <p>
          Conformément aux articles L217-3 et suivants du Code de la
          consommation, le Prestataire garantit la conformité de l&apos;ebook
          livré (fichier complet, lisible, conforme à la description). En cas
          de défaut, la Cliente peut demander la mise en conformité dans un
          délai de 30 jours.
        </p>
      </LegalSection>

      <LegalSection id="cartes-cadeau" title="8. Cartes cadeau">
        <p>
          Le Prestataire propose à la vente des cartes cadeau utilisables pour
          régler tout ou partie d&apos;une prestation en salon.
        </p>
        <p><strong>8.1. Modalités d&apos;achat</strong></p>
        <p>
          L&apos;achat s&apos;effectue en ligne. Le paiement intégral est dû à
          la commande, par carte bancaire via Stripe. Après confirmation, la
          carte cadeau est délivrée par email au bénéficiaire désigné (ou à
          l&apos;acheteuse) sous forme d&apos;un code unique au format{" "}
          <code>GIFT-XXXX-XXXX-XXXX</code>.
        </p>
        <p><strong>8.2. Validité</strong></p>
        <p>
          La carte cadeau est valable <strong>6 mois</strong> à compter de la
          date d&apos;achat. La date d&apos;expiration est indiquée dans
          l&apos;email de délivrance.
        </p>
        <p>
          Passé ce délai, le solde restant est définitivement perdu et ne peut
          donner lieu à aucun remboursement, sauf en cas de cessation
          d&apos;activité du Prestataire (voir article 8.5).
        </p>
        <p><strong>8.3. Utilisation</strong></p>
        <p>
          Le code peut être saisi au moment de la réservation d&apos;une
          prestation pour réduire le montant de l&apos;acompte. Le solde
          restant après utilisation reste utilisable jusqu&apos;à expiration.
        </p>
        <p>
          La carte cadeau n&apos;est ni rechargeable, ni convertible en
          espèces, ni échangeable contre un autre moyen de paiement. En cas de
          paiement excédentaire (carte d&apos;un montant supérieur à
          l&apos;acompte), le solde reste créditeur sur la carte pour un usage
          ultérieur.
        </p>
        <p><strong>8.4. Perte, vol et fraude</strong></p>
        <p>
          La carte cadeau est nominative et le code doit être conservé
          confidentiel. En cas de perte ou de vol du code, le Prestataire ne
          peut être tenu responsable de l&apos;utilisation frauduleuse par un
          tiers, à moins que la Cliente n&apos;ait signalé la perte avant
          utilisation.
        </p>
        <p><strong>8.5. Cessation d&apos;activité</strong></p>
        <p>
          En cas de cessation définitive d&apos;activité du Prestataire, les
          titulaires de cartes cadeau non utilisées disposent d&apos;un délai
          de 6 mois pour solliciter le <strong>remboursement intégral des
          montants non consommés</strong>, sur présentation du code de la
          carte et d&apos;une pièce d&apos;identité. Le remboursement est
          effectué par virement bancaire sous 30 jours.
        </p>
      </LegalSection>

      <LegalSection id="paiement" title="9. Modalités de paiement">
        <p>
          Le paiement de l&apos;acompte s&apos;effectue par carte bancaire via
          la plateforme sécurisée <strong>Stripe</strong> (chiffrement SSL,
          certification PCI-DSS). Le solde de la prestation est dû en espèces
          ou par carte bancaire à l&apos;issue du rendez-vous.
        </p>
        <p>
          La Cliente peut également utiliser une carte cadeau Clochette Nails
          valide pour régler tout ou partie de l&apos;acompte. Le code est à
          saisir au moment de la réservation.
        </p>
      </LegalSection>

      <LegalSection id="tarifs" title="10. Tarifs">
        <p>
          Les tarifs sont indiqués en euros, nets de taxes. Le Prestataire
          bénéficie de la franchise en base de TVA : la TVA n&apos;est pas
          applicable, conformément à l&apos;article 293 B du Code général des
          impôts.
        </p>
        <p>
          Les tarifs peuvent être modifiés à tout moment. Le tarif applicable
          est celui en vigueur à la date de la réservation.
        </p>
      </LegalSection>

      <LegalSection id="annulation" title="11. Annulation et remboursement (prestations en salon)">
        <p>
          <strong>Annulation par la Cliente :</strong>
        </p>
        <ul>
          <li>Plus de 72 heures avant le rendez-vous : l&apos;acompte est intégralement remboursé. L&apos;annulation peut être effectuée en ligne, via le lien sécurisé envoyé dans l&apos;email de confirmation, ou par email à <a href="mailto:contact@clochette-nails.fr">contact@clochette-nails.fr</a>.</li>
          <li>Moins de 72 heures avant le rendez-vous : l&apos;annulation reste possible mais l&apos;acompte est conservé à titre d&apos;indemnité forfaitaire, sans remboursement possible. Cette opération peut également être effectuée en ligne via le lien sécurisé.</li>
          <li>Absence non justifiée (« no-show ») : l&apos;acompte est conservé. Une seconde réservation ne pourra être effectuée qu&apos;après règlement intégral d&apos;un nouvel acompte.</li>
        </ul>
        <p>
          <strong>Modification (déplacement) du rendez-vous par la Cliente :</strong> la
          Cliente peut déplacer son rendez-vous en ligne, via le lien sécurisé envoyé dans
          l&apos;email de confirmation, <strong>uniquement jusqu&apos;à 72 heures avant la date
          prévue</strong>. L&apos;acompte versé est conservé et reporté sur le nouveau créneau,
          à prestation identique.
        </p>
        <p>
          Passé ce délai, le déplacement en ligne n&apos;est plus possible. La Cliente
          souhaitant tout de même décaler son rendez-vous doit procéder à une annulation
          (avec perte de l&apos;acompte selon les modalités ci-dessus), puis effectuer une
          nouvelle réservation accompagnée d&apos;un nouvel acompte. La Cliente peut, en
          alternative, contacter directement le salon pour étudier les solutions
          possibles selon les disponibilités.
        </p>
        <p>
          <strong>Limite à une modification :</strong> pour faciliter l&apos;organisation du
          salon, le rendez-vous ne peut être annulé ou déplacé en ligne qu&apos;une seule fois.
          Toute demande ultérieure doit être adressée par email ou par téléphone au salon.
        </p>
        <p>
          <strong>Acompte réglé en main propre :</strong> lorsque le rendez-vous a été
          pris au salon et que l&apos;acompte a été réglé directement sur place (espèces,
          virement bancaire, chèque, ou terminal de paiement), l&apos;acompte est conservé
          en cas d&apos;annulation, à titre d&apos;indemnité forfaitaire, indépendamment du
          délai. Le remboursement automatique en ligne est techniquement impossible dans
          ce cas. Pour toute demande spécifique (geste commercial, cas exceptionnel), la
          Cliente est invitée à contacter directement le salon.
        </p>
        <p>
          <strong>Acompte réglé tout ou partie par carte cadeau :</strong> lorsque
          l&apos;acompte a été couvert (totalement ou partiellement) par l&apos;utilisation
          d&apos;une carte cadeau, l&apos;annulation en ligne plus de 72 heures avant le
          rendez-vous donne lieu à un re-crédit immédiat de la portion correspondante sur
          la carte cadeau d&apos;origine (montant remis à disposition pour une future
          réservation, dans la limite de la date d&apos;expiration initiale de la carte).
          Si l&apos;acompte mêlait carte cadeau et carte bancaire, chaque portion est
          remboursée sur son support d&apos;origine : portion carte bancaire via Stripe
          (3-5 jours ouvrés), portion carte cadeau re-créditée immédiatement. En cas
          d&apos;annulation moins de 72 heures avant le rendez-vous, les règles classiques
          de conservation de l&apos;acompte s&apos;appliquent : la portion carte cadeau
          n&apos;est pas re-créditée, à titre d&apos;indemnité forfaitaire.
        </p>
        <p>
          <strong>Annulation par le Prestataire :</strong> en cas
          d&apos;impossibilité d&apos;assurer la Prestation (maladie, force
          majeure), le Prestataire propose en priorité un report. À défaut
          d&apos;accord sur un nouveau créneau, l&apos;acompte est intégralement
          remboursé sous 14 jours (selon le mode de paiement initial : carte
          bancaire et/ou re-crédit carte cadeau).
        </p>
      </LegalSection>

      <LegalSection id="retractation" title="12. Droit de rétractation">
        <p><strong>12.1. Prestations en salon</strong></p>
        <p>
          Conformément à l&apos;article L221-28 du Code de la consommation, le
          droit de rétractation ne s&apos;applique pas aux contrats de
          fourniture de services pleinement exécutés avant la fin du délai de
          rétractation lorsque la Cliente a expressément renoncé à ce droit.
        </p>
        <p>
          En validant sa réservation pour un créneau intervenant dans les 14
          jours, la Cliente reconnaît expressément renoncer à son droit de
          rétractation pour la prestation réservée. Les modalités d&apos;annulation
          prévues à l&apos;article 11 demeurent applicables.
        </p>
        <p><strong>12.2. Ebooks (biens numériques)</strong></p>
        <p>
          Le droit de rétractation est exclu pour la fourniture d&apos;ebooks
          dès lors que la délivrance est immédiate après paiement (article
          L221-28 13° Code de la consommation). Voir article 7.4 ci-dessus.
        </p>
        <p><strong>12.3. Cartes cadeau</strong></p>
        <p>
          La Cliente dispose d&apos;un délai de 14 jours à compter de
          l&apos;achat pour exercer son droit de rétractation sur une carte
          cadeau, dès lors que celle-ci n&apos;a fait l&apos;objet
          d&apos;aucune utilisation. Au-delà ou en cas d&apos;utilisation
          partielle, la rétractation n&apos;est plus possible.
        </p>
      </LegalSection>

      <LegalSection id="responsabilite" title="13. Responsabilité">
        <p>
          Le Prestataire s&apos;engage à exécuter les Prestations dans le
          respect des règles d&apos;hygiène en vigueur (désinfection des outils,
          usage unique des limes/buffers, port de gants).
        </p>
        <p>
          La Cliente s&apos;engage à signaler avant la Prestation toute
          allergie, pathologie ou contre-indication médicale. La responsabilité
          du Prestataire ne saurait être engagée en cas de non-déclaration.
        </p>
        <p>
          Le Prestataire est titulaire d&apos;une assurance responsabilité
          civile professionnelle <LegalTodo>[références à compléter : assureur + numéro]</LegalTodo>.
        </p>
      </LegalSection>

      <LegalSection id="donnees" title="14. Données personnelles">
        <p>
          Les modalités de collecte, de traitement et de conservation des
          données personnelles de la Cliente sont décrites dans la{" "}
          <a href="/confidentialite">Politique de Confidentialité</a>, qui fait
          partie intégrante des présentes CGV.
        </p>
      </LegalSection>

      <LegalSection id="propriete" title="15. Propriété intellectuelle">
        <p>
          L&apos;ensemble des éléments du site (textes, images, logo, charte
          graphique) est protégé par le droit d&apos;auteur. Toute reproduction,
          représentation ou utilisation, totale ou partielle, est interdite sans
          autorisation écrite préalable du Prestataire.
        </p>
      </LegalSection>

      <LegalSection id="litiges" title="16. Droit applicable et litiges">
        <p>
          Les présentes CGV sont soumises au droit français. En cas de litige,
          la Cliente est invitée à contacter le Prestataire pour rechercher une
          solution amiable.
        </p>
        <p>
          À défaut de résolution amiable, le litige pourra être porté devant le
          médiateur de la consommation (voir article 15). En dernier recours,
          le tribunal compétent sera celui du lieu de résidence de la Cliente
          ou du siège du Prestataire, conformément aux dispositions du Code de
          la consommation.
        </p>
      </LegalSection>

      <LegalSection id="mediateur" title="17. Médiateur de la consommation">
        <p>
          Conformément aux articles L611-1 et suivants du Code de la
          consommation, la Cliente peut recourir gratuitement au médiateur de
          la consommation suivant :
        </p>
        <p>
          <LegalTodo>[Nom du médiateur de la consommation à compléter — ex : « CNPM Médiation Consommation »]</LegalTodo>
          <br />
          <LegalTodo>[Adresse / site web du médiateur]</LegalTodo>
        </p>
        <p>
          La Commission européenne met également à disposition une plateforme
          de règlement en ligne des litiges :{" "}
          <a href="https://ec.europa.eu/consumers/odr" target="_blank" rel="noopener noreferrer">
            https://ec.europa.eu/consumers/odr
          </a>
        </p>
      </LegalSection>
    </LegalLayout>
  );
}
