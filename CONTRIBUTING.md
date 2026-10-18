# Contributing to CoE-NNECT

First off, thank you for considering contributing to CoE-NNECT! It's people like you that make open-source tools like this possible.

## 1. Where do I go from here?

If you've noticed a bug or have a feature request, please make sure to check the existing [Issues](https://github.com/RADENzzz/coe-nnect/issues) before opening a new one. 

## 2. Development Setup

CoE-NNECT is a monorepo managed with `pnpm` workspaces. Please review the `README.md` for full details.

Ensure you have the following installed:
- Node.js 24+
- pnpm 12.6.0+
- Python 3.12+ (for the Solver and Parser services)

```powershell
git clone https://github.com/RADENzzz/coe-nnect.git
cd coe-nnect
pnpm install
