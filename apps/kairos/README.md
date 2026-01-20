# Kairos

Kairos is the forecasting workspace in the Targon ecosystem.

- Import Google Trends interest-over-time into Kairos as a stored time series.
- Create forecasts (Prophet, ETS, ARIMA, Theta, NeuralProphet) and view model output (historical fit + future horizon).
- Prophet forecasts can optionally include regressors; Kairos auto-forecasts regressor future values and uses them to forecast the target series.
- Forecast execution runs via the Python ML service in `services/kairos-ml` (requires `KAIROS_ML_URL`).
- All data is stored in Kairos' own database schema (Prisma + migrations).
