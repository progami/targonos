-- Expand ForecastModel enum for additional models
ALTER TYPE "ForecastModel" ADD VALUE 'ARIMA';
ALTER TYPE "ForecastModel" ADD VALUE 'THETA';
ALTER TYPE "ForecastModel" ADD VALUE 'NEURALPROPHET';

