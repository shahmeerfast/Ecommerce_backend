# Payment Release Feature

## Overview
This feature allows buyers to confirm receipt of their delivered orders, which automatically schedules payment release to sellers after 24 hours. This provides a safety mechanism for buyers while ensuring sellers receive their payments in a timely manner.

## How It Works

### 1. Order Delivery
- When an order status is updated to "Delivered", the order becomes eligible for receipt confirmation
- Buyers can see a "Received & Confirmed" button on their orders page

### 2. Receipt Confirmation
- Buyers click the "Received & Confirmed" button to confirm they have received their order
- This action:
  - Sets `receiptConfirmed: true` on the order
  - Records the confirmation timestamp
  - Schedules payment release for 24 hours later
  - Sends notifications to both buyer and seller

### 3. Automatic Payment Release
- After 24 hours, the payment release scheduler automatically:
  - Calculates payment distribution
  - Releases payments to sellers
  - Updates order status
  - Sends final notifications

## Database Schema Changes

The order model has been extended with new fields:

```javascript
// Payment release tracking
receiptConfirmed: { type: Boolean, default: false },
receiptConfirmedAt: { type: Date },
paymentReleaseScheduled: { type: Boolean, default: false },
paymentReleaseDate: { type: Date }
```

## API Endpoints

### Confirm Receipt
```
POST /api/order/confirm-receipt
Body: { orderId: "order_id_here" }
Headers: { token: "user_token" }
```

**Response:**
```json
{
  "success": true,
  "message": "Receipt confirmed successfully. Payment will be released to seller after 24 hours.",
  "paymentReleaseDate": "2025-01-15T10:30:00.000Z"
}
```

## Frontend Integration

### Orders Page
- Added receipt confirmation status display
- "Received & Confirmed" button for eligible orders
- Payment release countdown timer
- Real-time status updates

### Button States
- **Visible**: Only for delivered orders that haven't been confirmed
- **Disabled**: While confirmation is processing
- **Hidden**: After receipt is confirmed

## Running the Payment Release Scheduler

The scheduler runs automatically to process payments after 24 hours:

```bash
# Run the scheduler
npm run scheduler

# Or run directly
node scripts/paymentReleaseScheduler.js
```

### Scheduler Features
- Runs every hour to check for orders ready for payment release
- Processes multiple orders in batches
- Handles errors gracefully without stopping the process
- Logs all activities for monitoring

## Security Features

- Only order owners can confirm receipt
- Orders must be in "Delivered" status
- Receipt can only be confirmed once
- 24-hour waiting period prevents immediate payment release
- All actions are logged and auditable

## Notifications

### Buyer Notifications
- Receipt confirmation success
- Payment release scheduled
- Payment released to seller

### Seller Notifications
- Receipt confirmed by buyer
- Payment release scheduled
- Payment has been released

## Activity Logging

All payment release activities are logged with:
- User ID and action type
- Order reference
- Timestamp and status
- Amount and description

## Error Handling

- Network failures during confirmation
- Invalid order IDs
- Unauthorized access attempts
- Database connection issues
- Payment calculation failures

## Monitoring

Monitor the payment release process through:
- Application logs
- Activity log entries
- Database queries on order status
- Scheduler execution logs

## Future Enhancements

Potential improvements:
- Configurable waiting periods
- Escalation for disputed orders
- Integration with dispute resolution system
- Advanced scheduling options
- Payment release analytics
