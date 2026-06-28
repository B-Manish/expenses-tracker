# iPhone SMS Automation

The personal automation must filter messages before running the API request.
This keeps unrelated messages away from the transaction parser.

## Filter

In the message-received automation, match the original message body against:

```regex
(?i)\b(?:debit(?:ed)?|credit(?:ed)?)\b
```

Run **Get Contents of URL** only when **Match Text** returns a match. Leave the
otherwise branch empty. The expression is case-insensitive and matches the
complete words `debit`, `debited`, `credit`, and `credited`.

## Request

Configure **Get Contents of URL** as follows:

- URL: `https://tracker.manishbatchu.com/api/sms-imports/ingest`
- Method: `POST`
- Header `Authorization`: `Bearer YOUR_SMS_INGEST_TOKEN`
- Header `Content-Type`: `application/json`
- Request body: JSON
- `sender`: the sender value supplied by the message automation
- `message`: the original message body supplied by the message automation

Insert the automation variables directly into `sender` and `message`. Do not
trim, rewrite, summarize, or replace the message with test text.

The equivalent request shape is:

```json
{
  "sender": "HDFCBK",
  "message": "Rs.450.00 debited from A/c XX1234 via UPI to SWIGGY. Ref 123456789012."
}
```

The endpoint also checks the same keywords. If an unrelated message is sent
accidentally, it returns HTTP `200` with:

```json
{
  "success": true,
  "data": {
    "accepted": false,
    "skipped": true,
    "reason": "no_transaction_keyword"
  }
}
```
