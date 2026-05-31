# Training Data Pipeline

You no longer need to hand-edit `training.js`.

## Files

- `data/topics/*.json`: your curated topic datasets
- `data/raw/`: downloaded datasets before import
- `scripts/import-pairs.js`: converts CSV / JSON / JSONL into topic files
- `scripts/build-training.js`: builds `training.js` from `data/topics/`

## Add More Data

1. Put a dataset file in `data/raw/`
2. Import it:

```powershell
npm run import:pairs -- --input data/raw/my-dataset.csv --output imported.json --topic imported
```

3. Rebuild:

```powershell
npm run build:data
```

This now rebuilds both:

- `training.js`
- `model.json`

If PowerShell blocks `npm.ps1`, run the Node scripts directly:

```powershell
node scripts/import-pairs.js --input data/raw/my-dataset.csv --output imported.json --topic imported
node scripts/build-training.js
node scripts/build-model.js
```

## Large Imports

For large conversation datasets like DailyDialog, import them as disabled topic files first so they do not immediately bloat the browser build:

```powershell
node scripts/import-dailydialog.js
```

This creates `data/topics/dailydialog-train.full.json` with `enabled: false`.
If you want to include it later, change `enabled` to `true` and rebuild.

## Supported Raw Formats

- CSV with `user` and `ai` columns
- JSON arrays of objects
- JSONL objects per line

You can map different column names:

```powershell
npm run import:pairs -- --input data/raw/dialogs.csv --output dialogs.json --topic dialogs --user-field prompt --ai-field response
```

## Good Sources

- Open dialogue datasets from Hugging Face
- Wikipedia or Wikimedia-derived pairs you create with attribution
- Your own logged chats
- Public-domain text you convert into question/answer pairs

## Recommended Flow

- Keep raw downloads in `data/raw/`
- Keep cleaned curated pairs in `data/topics/`
- Only ship the generated `training.js` to the browser
