# Historical Data Import Guide

## Overview

The historical data import system allows you to merge CSV exports from your reading history with the current RSS-based book data. This preserves the real-time RSS functionality while enhancing books with historical ratings, reviews, and enrichment data.

## CSV Field Mapping

The import script maps your CSV fields to the Field Dictionary structure:

### Core Identification
- `goodreads_id` or `Book Id` → `goodreads_id`
- `guid` → `guid`
- `Title` → `title` and `book_title`
- `Author` → `author_name`
- `ISBN` → `isbn`

### Reading History
- `Date Read` → `user_read_at` (primary completion date)
- `Date Added` → `user_date_added`
- `user_date_created` → `user_date_created`
- `My Rating` → `user_rating`
- `My Review` → `notes`

### Book Metadata
- `book_image_url` → `book_image_url`
- `book_description` → `book_description`
- `Average Rating` → `average_rating`
- `Original Publication Year` → `book_published`
- `Number of Pages` → `pages_source`

### Series & Classification
- `book_title` → `book_title` (if different from Title)
- `series_name` → `series_name`
- `series_number` → `series_number`
- `trope` → `tropes` (parsed as array)
- `tone` → `tone`

### Enrichment Fields
- `liked` → `liked`
- `disliked` → `disliked`
- `rating_scale_tag` → `rating_scale_tag`
- `inferred_score` → `inferred_score`
- `goal_year` → `goal_year` (auto-calculated from Date Read if missing)
- `hype_flag` → `hype_flag`
- `availability_source` → `availability_source`
- `ku_expires_on` → `ku_expires_on`

## Import Strategy

### Data Enhancement Priority
1. **Historical Data Priority**: Fill missing information from historical export
2. **Complete Enhancement**: Historical data enhances all available fields
3. **New Book Addition**: Books not in RSS are added from historical data
4. **Intelligent Merging**: Better data wins (longer descriptions, cleaner titles)

### Merge Rules

#### Fields Preserved from RSS (Core Identity)
- `guid`, `link`, `pubdate`, `updated_at`, `status`

#### Fields Always Enhanced from Historical
- `user_rating`, `user_date_created`, `tone`, `pages_source`
- `liked`, `disliked`, `notes`, `rating_scale_tag`, `inferred_score`
- `hype_flag`, `availability_source`, `ku_expires_on`

#### Fields Filled or Enhanced from Historical
- `isbn`, `title`, `book_title`, `author_name`, `book_image_url`
- `book_description`, `book_published`, `average_rating`
- `series_name`, `series_number`, `next_release_date`, `goal_year`

#### Special Date Handling
- `user_read_at`, `user_date_added`: Historical dates preferred (more accurate)
- Conflicts logged but historical data used

#### Intelligent Enhancement
- **Descriptions**: Use longer/more complete version
- **Titles**: Use cleaner historical titles
- **Tropes**: Merge arrays from both sources

## Usage Instructions

### 1. Preview Import (Recommended First Step)
```bash
node scripts/import-historical-data.js /path/to/historical_export.csv --preview
```

This shows:
- CSV structure and field mapping
- Sample book transformations
- Data validation results
- No changes made to books.json

### 2. Execute Import
```bash
node scripts/import-historical-data.js /path/to/historical_export.csv
```

This performs:
- Full CSV parsing and validation
- Data merging with existing books
- New book addition from historical data
- Conflict detection and logging

## Data Processing

### Automatic Transformations
- **Dates**: All date strings converted to proper Date objects
- **Numbers**: Ratings and page counts properly typed as integers/floats
- **Arrays**: Trope field parsed from comma/semicolon-separated values
- **Goal Year**: Auto-calculated from Date Read if missing
- **Status**: All imported books marked as `status: "Read"`
- **Queue**: All imported books have `queue_position: null, queue_priority: null`

### Validation Rules
- Books without `goodreads_id` or `guid` are skipped
- Invalid dates are set to `null`
- Invalid numbers are set to `null`
- Empty fields are converted to appropriate defaults

## Output and Logging

### Updated Files
- `data/books.json`: Merged book data
- `history/historical_import_[timestamp].jsonl`: Import operation log
- `reports/historical_import_conflicts.json`: Conflict details (if any)

### Import Statistics
- Total CSV rows processed
- New books added
- Existing books updated
- Rows skipped (missing IDs)
- Errors encountered
- Conflicts detected

### Conflict Handling
When RSS and historical data conflict:
- RSS data is preserved
- Conflict is logged with both values
- Historical data is noted for manual review

## Example Workflow

1. **Prepare CSV**: Ensure your historical export matches expected field names
2. **Preview**: Run preview mode to verify field mapping
3. **Backup**: Current books.json is automatically backed up
4. **Import**: Execute full import
5. **Review**: Check conflict report and statistics
6. **Verify**: Spot-check merged data in books.json

## Field Dictionary Compliance

After import, all books maintain 100% Field Dictionary compliance:
- All required fields present
- Proper data types maintained
- Consistent naming conventions
- Full audit trail preserved

## Troubleshooting

### Common Issues
- **Missing IDs**: Books without goodreads_id or guid are skipped
- **Date Format**: Ensure dates are in recognizable format (YYYY-MM-DD preferred)
- **Encoding**: CSV should be UTF-8 encoded
- **Field Names**: Case-sensitive field matching (use preview to verify)

### Recovery
- Original books.json backed up before import
- History logs track all changes
- Import can be re-run after CSV corrections
- Conflicts can be manually resolved using logged data