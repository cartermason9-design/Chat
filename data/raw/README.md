# Raw Data

Drop downloaded datasets here before importing them into `data/topics/`.

Supported import formats:

- `.json`
- `.jsonl`
- `.csv`

Example:

```powershell
npm run import:pairs -- --input data/raw/colors.csv --output colors.json --topic colors
npm run build:data
```

Expected fields by default:

- `user`
- `ai`

You can map other column names too:

```powershell
npm run import:pairs -- --input data/raw/dialogs.csv --output dialogs.json --topic dialogs --user-field prompt --ai-field response
```
