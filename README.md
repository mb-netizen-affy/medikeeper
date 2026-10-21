# MediKeeper 💊

L'armoire à pharmacie de la famille, scannée en un clin d'œil.

- **Scan en rafale** : on vide l'armoire sur la table, on scanne les boîtes à la suite (bip à chaque boîte), on valide tout d'un coup. Le nom, la substance, le lot et la date de péremption sont lus automatiquement dans le Datamatrix.
- **Trousses** : Maison, Voiture, Voyage, Chez Maman… chacune avec sa checklist.
- **J'en ai déjà ?** : au comptoir, on scanne la boîte ou on tape un nom ; l'app cherche aussi par substance (Doliprane ↔ Dafalgan → paracétamol).
- **Armoire d'un proche** : export / import d'une trousse en fichier (la synchro automatique viendra en V2).
- Données **uniquement sur le téléphone** (localStorage), aucun compte.

## Arborescence

```
medikeeper/
├── package.json
├── .gitignore
├── README.md
├── app/
│   ├── layout.js
│   ├── page.js
│   └── globals.css
├── components/
│   ├── Scanner.js
│   ├── ScanSession.js
│   ├── Inventory.js
│   ├── CheckOwned.js
│   └── Kits.js
├── lib/
│   ├── gs1.js
│   ├── meds.js
│   ├── store.js
│   └── utils.js
├── scripts/
│   └── build-meds.mjs
└── public/
    ├── manifest.json
    ├── icon.svg
    └── meds.json   ← généré par `npm run meds`
```

## Démarrer

```bash
npm install
npm run meds      # télécharge la base ANSM → public/meds.json (~quelques Mo)
npm run dev       # http://localhost:3000
```

Si le téléchargement échoue : récupère `CIS_bdpm.txt`, `CIS_CIP_bdpm.txt` et `CIS_COMPO_bdpm.txt` sur
https://base-donnees-publique.medicaments.gouv.fr/telechargement, mets-les dans un dossier, puis
`npm run meds -- ./ce-dossier`.

Sans `meds.json`, l'app marche quand même : elle demande le nom des boîtes inconnues et s'en souvient.

## Tester sur le téléphone

La caméra exige **https**. Deux options :

1. **Le plus simple : déployer sur Vercel** (nouveau dépôt GitHub `medikeeper` → Import sur vercel.com). N'oublie pas de committer `public/meds.json`.
2. En local : `npm run dev:https`, puis ouvre `https://<IP-de-ton-PC>:3000` depuis le téléphone sur le même Wi-Fi (accepte l'avertissement du certificat).

Sur ordinateur sans caméra, utilise « Saisir un code à la main » dans l'onglet Scanner, par exemple :
`01034009359558381727123110LOT1` (Doliprane, péremption 12/2027) ou simplement un CIP13 comme `3400935955838`.

Pour installer l'app : Safari → Partager → « Sur l'écran d'accueil » ; Chrome → menu → « Installer l'application ».

## À savoir

- Le Datamatrix contient : code produit (01), péremption (17, AAMMJJ), lot (10), numéro de série (21). Le décodage est dans `lib/gs1.js` et gère les codes où les séparateurs ont été perdus.
- Hors de France, le nom n'est pas connu (pas de base) : l'app le demande une fois et le retient pour ce code.
- MediKeeper gère un stock : **aucun conseil de posologie ni de traitement**.

## Prochaines étapes (V2)

- Synchro familiale en temps réel (comptes + base, ex. Supabase)
- Alertes de rappels de lots ANSM
- Notifications push avant péremption
