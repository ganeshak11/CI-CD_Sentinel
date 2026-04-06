# PowerShell script for Git push with branch protection

$ErrorActionPreference = "Stop"

Write-Host "----------- Git Push -----------" -ForegroundColor Cyan

# Detect current branch
$branchName = git rev-parse --abbrev-ref HEAD
Write-Host "Current branch: $branchName" -ForegroundColor Yellow

# Protect main and dev branches
if ($branchName -eq "main" -or $branchName -eq "dev") {
    Write-Host ""
    Write-Host "❌ ERROR: Direct push to $branchName is not allowed." -ForegroundColor Red
    Write-Host ""
    Write-Host "Workflow:" -ForegroundColor Yellow
    Write-Host "  1. Create feature branch: git checkout -b feature/your-feature"
    Write-Host "  2. Push feature branch: .\push.ps1"
    Write-Host "  3. Create PR to dev branch on GitHub"
    Write-Host "  4. Get 1 team member review"
    Write-Host "  5. Merge to dev after approval"
    Write-Host ""
    Write-Host "Only team lead can merge dev → main" -ForegroundColor Yellow
    exit 1
}

# Show current status
Write-Host ""
Write-Host "Current changes:" -ForegroundColor Cyan
git status
Write-Host ""

# Ask commit message
$commitMessage = Read-Host "Enter commit message"

if ([string]::IsNullOrWhiteSpace($commitMessage)) {
    Write-Host "Commit message cannot be empty." -ForegroundColor Red
    exit 1
}

# Select commit type
Write-Host ""
Write-Host "Select commit type:" -ForegroundColor Cyan
Write-Host "1) feat"
Write-Host "2) fix"
Write-Host "3) refactor"
Write-Host "4) docs"
Write-Host "5) chore"
$typeChoice = Read-Host "Choice"

switch ($typeChoice) {
    "1" { $prefix = "feat" }
    "2" { $prefix = "fix" }
    "3" { $prefix = "refactor" }
    "4" { $prefix = "docs" }
    "5" { $prefix = "chore" }
    default {
        Write-Host "Invalid choice." -ForegroundColor Red
        exit 1
    }
}

$fullCommitMessage = "$prefix`: $commitMessage"

# Stage changes
Write-Host ""
Write-Host "Adding changes..." -ForegroundColor Cyan
git add .

# Check if anything is staged
$stagedChanges = git diff --cached --quiet
if ($LASTEXITCODE -eq 0) {
    Write-Host "No changes staged. Nothing to commit." -ForegroundColor Yellow
    exit 0
}

# Commit
Write-Host "Committing..." -ForegroundColor Cyan
git commit -m $fullCommitMessage

# Run tests if package.json exists
if (Test-Path "package.json") {
    Write-Host ""
    Write-Host "Running tests..." -ForegroundColor Cyan
    npm test
}

# Push
Write-Host ""
Write-Host "Pushing to origin/$branchName ..." -ForegroundColor Cyan
git push origin $branchName

Write-Host ""
Write-Host "----------- Push Complete -----------" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. Go to GitHub repository"
Write-Host "  2. Create Pull Request: $branchName → dev"
Write-Host "  3. Request review from 1 team member"
Write-Host "  4. Wait for approval before merging"
