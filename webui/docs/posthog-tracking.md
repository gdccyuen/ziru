# PostHog WebUI Tracking Setup

This runbook configures the four baseline insights for Ziru WebUI usage.

## Events

- `ziru_upload_button_clicked`
- `ziru_document_upload_completed`
- `ziru_assistant_question_submitted`
- `ziru_dashboard_link_clicked`

## Create the Insights

1. Open PostHog `Product Analytics -> Insights`.
2. Create a `Trends` insight named `WebUI - Upload Button Clicks`.
   - Series: event `ziru_upload_button_clicked`
   - Math: `Total count`
3. Create `WebUI - Uploaded Documents`.
   - Series: event `ziru_document_upload_completed`
   - Math: `Sum`
   - Property: `uploaded_count`
4. Create `WebUI - Avg Sources Per Question`.
   - Series: event `ziru_assistant_question_submitted`
   - Math: `Average`
   - Property: `selected_sources_count`
5. Create `WebUI - Dashboard Click Users`.
   - Series: event `ziru_dashboard_link_clicked`
   - Math: `Unique users`

## Dashboard

1. Open PostHog `Dashboards` and create `WebUI Tracking`.
2. Add all four insights above to this dashboard.
3. Use a rolling `Last 30 days` filter for product reviews.
