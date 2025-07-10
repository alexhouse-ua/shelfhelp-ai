const TitleParser = require('./title-parser');

const parser = new TitleParser();

const specificTitles = [
  "Caught Up: Into Darkness Trilogy (Into Darkness Series)",
  "Duplicity (Seraph)",
  "Bittersweet Melody (The Bittersweet Symphony Duet, #2.5)",
  "Flock (The Ravenhood Book 1)",
  "Audacity (Seraph)",
  "Unite Me (Shatter Me, #1.5-2.5)"
];

console.log('Testing Specific Titles with Series Notation:');
console.log('=============================================\n');

specificTitles.forEach(title => {
  const result = parser.parse(title);
  console.log(`Input: "${title}"`);
  console.log(`  Book Title: "${result.book_title}"`);
  console.log(`  Series: "${result.series_name}"`);
  console.log(`  Number: ${result.series_number}`);
  console.log('');
});