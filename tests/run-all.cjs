#!/usr/bin/env node
/**
 * Run all tests
 * Usage: node tests/run-all.cjs
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('\n🚀 Running All Tests\n');
console.log('====================\n');

const testsDir = __dirname;
const testFiles = fs.readdirSync(testsDir)
  .filter(f => f.endsWith('.test.js'))
  .sort();

let allPassed = true;

for (const testFile of testFiles) {
  const testPath = path.join(testsDir, testFile);
  console.log(`\n📁 ${testFile}\n`);

  try {
    execSync(`node "${testPath}"`, { stdio: 'inherit' });
  } catch (err) {
    allPassed = false;
  }
}

console.log('\n====================');
if (allPassed) {
  console.log('\n✨ All test suites passed! ✨\n');
} else {
  console.log('\n❌ Some tests failed\n');
  process.exit(1);
}
