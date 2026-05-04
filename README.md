# Tear-Aware Brushing in DimBridge

This repository contains a work-in-progress prototype developed in the context of the TUM Chair of Algorithms project.

## What this prototype does

This version connects map-tearing diagnostics from the MNIST analysis workflow to DimBridge brushing interaction.

Current functionality:
- computes top tear pairs in the MNIST workflow
- extracts tear endpoint points
- passes tear-aware metadata into DimBridge
- reports after brushing:
  - brushed points
  - tear points inside selection
  - tear density

## Current status

This is a research prototype and still in progress.
It is functional for end-to-end testing, but it is not yet a polished software release.

## Repository contents

- `notebooks/t-SNE_UMAP_MINST.ipynb` — working MNIST notebook
- `docs/TUM_Chair_of_Algorithms_Tear_Aware_DimBridge_Short_Report.pdf` — short public-facing writeup
- modified DimBridge code including tear-aware brushing logic

## Setup

```bash
git clone -b tear-aware-brushing https://github.com/Nawaf-TBE/dimbridge-jupyter.git
cd dimbridge-jupyter
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
npm install
npm run build
jupyter lab
How to run
Open JupyterLab
Open notebooks/t-SNE_UMAP_MINST.ipynb
Run the notebook cells in order
Open the DimBridge widget
Brush regions in the projection view
Inspect the browser console for tear-aware output
Expected console output

The current prototype reports:

Brushed points
Tear points inside selection
Tear density
Tear rows
Notes
The current prototype has been validated on the MNIST workflow
The tear-aware logic is integrated into the DimBridge brushing flow
The implementation is intended for testing and research discussion
