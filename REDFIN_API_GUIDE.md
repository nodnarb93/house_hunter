# Redfin Data Access Guide

## Overview
Redfin provides two main methods for accessing listing data programmatically: RSS feeds and JSON/CSV APIs. This guide documents both approaches.

## Method 1: RSS Feed (Newest Listings)

### Format
```
https://www.redfin.com/stingray/[region_type]/[region_id]/newest_listings.rss
```

### Example
```
https://www.redfin.com/stingray/6/4664/newest_listings.rss
```

### Parameters
- **region_type**: Numeric code for the region type
  - `2` = Zip code
  - `6` = City
  - (other types exist for neighborhoods, counties, etc.)
- **region_id**: Unique identifier for the region (found in the Redfin URL)

### How to Find Your Parameters
1. Navigate to your desired location on Redfin (e.g., `https://www.redfin.com/city/4664/OH/Columbus`)
2. Extract `region_id` from the URL (the number after `/city/` or `/zip/`)
3. Extract `region_type` (typically `6` for cities, `2` for zip codes)

### Limitations
- ⚠️ **Does NOT support filters** (price, beds, baths, property type, etc.)
- Returns all new listings in the region
- RSS format (XML)

### Source
Found in [Redfin's robots.txt](https://www.redfin.com/robots.txt):
```
Allow: /stingray/*/*/newest_listings.rss
```

---

## Method 2: Stingray GIS-CSV API (Recommended)

### Format
```
https://www.redfin.com/stingray/api/gis-csv
```

### Example Request
```python
import requests
import pandas as pd
from io import StringIO

params = {
    'al': 1,                    # Include additional listing data
    'market': 'columbus',       # Market area
    'max_price': 600000,        # Maximum price
    'min_beds': 3,              # Minimum bedrooms
    'min_baths': 2,             # Minimum bathrooms
    'num_homes': 350,           # Number of results to return
    'page_number': 1,           # Page number for pagination
    'region_id': 4664,          # Region ID (from URL)
    'region_type': 6,           # Region type (6 = city)
    'uipt': '1,2,3',           # Property types: 1=house, 2=condo, 3=townhouse
    'v': 8                      # API version
}

response = requests.get(
    'https://www.redfin.com/stingray/api/gis-csv',
    params=params,
    headers={'User-Agent': 'Mozilla/5.0'}
)

# Parse CSV response
df = pd.read_csv(StringIO(response.text))
print(f"Found {len(df)} listings")
```

### Key Parameters

| Parameter | Description | Example Values |
|-----------|-------------|----------------|
| `region_id` | Unique region identifier | `4664` (Columbus) |
| `region_type` | Type of region | `2` (zip), `6` (city) |
| `market` | Market area | `columbus`, `sfbay`, `dc` |
| `min_beds` | Minimum bedrooms | `3` |
| `max_beds` | Maximum bedrooms | `5` |
| `min_baths` | Minimum bathrooms | `2` |
| `max_baths` | Maximum bathrooms | `3` |
| `min_price` | Minimum price | `200000` |
| `max_price` | Maximum price | `600000` |
| `uipt` | Property types (comma-separated) | `1,2,3` (house, condo, townhouse) |
| `num_homes` | Results per page | `350` |
| `page_number` | Page number | `1`, `2`, `3`... |
| `status` | Listing status | `9` (active) |
| `v` | API version | `8` |

### Property Type Codes (uipt)
- `1` = House
- `2` = Condo
- `3` = Townhouse
- `4` = Multi-family
- `5` = Land
- `6` = Other

### Response Format
Returns CSV data with columns including:
- `ADDRESS`
- `CITY`
- `STATE OR PROVINCE`
- `ZIP OR POSTAL CODE`
- `PRICE`
- `BEDS`
- `BATHS`
- `PROPERTY TYPE`
- `SQUARE FEET`
- `LOT SIZE`
- `YEAR BUILT`
- `DAYS ON MARKET`
- `URL (SEE https://www.redfin.com/buy-a-home/comparative-market-analysis FOR INFO ON PRICING)`
- And many more...

### Advantages
- ✅ Supports **all filters** (price, beds, baths, property type, etc.)
- ✅ Returns structured CSV/JSON data
- ✅ Supports pagination for large result sets
- ✅ More comprehensive property information

### Source
Discovered through reverse engineering Redfin's web application network requests. Documented in various GitHub repositories:
- [RedfinPlus Documentation](https://github.com/alientechsw/RedfinPlus/blob/master/docs/REDFIN.md)
- [ScrapFly Redfin Guide](https://scrapfly.io/blog/how-to-scrape-redfin/)

---

## Alternative: Gemini's "Stingray RSS-Search" Endpoint

### Format
```
https://www.redfin.com/stingray/do/rss-search?region_id=[ID]&region_type=[TYPE]&market=[MARKET]
```

### Example
```
https://www.redfin.com/stingray/do/rss-search?region_id=4664&region_type=6&market=columbus
```

### Status
- ⚠️ **Unverified** - This endpoint is mentioned in community discussions but not officially documented
- ⚠️ May not support filters (similar to the newest_listings.rss feed)
- Use at your own risk; may be deprecated or rate-limited

---

## Best Practices

1. **Always include a User-Agent header** to avoid being blocked
   ```python
   headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
   ```

2. **Respect rate limits** - Add delays between requests
   ```python
   import time
   time.sleep(1)  # Wait 1 second between requests
   ```

3. **Use the GIS-CSV API for filtered searches** - It's more powerful and returns complete data

4. **Use RSS feeds for simple "newest listings" monitoring** - When you don't need filters

5. **Check Redfin's Terms of Service** - Ensure your use case complies with their policies

---

## Recommendation

For your house hunting tool with filters (max-price=600k, min-beds=3, min-baths=2, etc.), use the **Stingray GIS-CSV API** (Method 2). It supports all your filters and returns structured data that's easy to parse and filter further in your application.