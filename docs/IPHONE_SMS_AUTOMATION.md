# iPhone SMS Automation

The personal automation can forward any non-empty message to the API. A
message without a recognizable debit or credit direction is accepted and
defaults to an expense for later review.

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
