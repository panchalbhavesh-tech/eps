import React from 'react';
import { FactorChart, FactorChartProps } from './FactorChart';

export interface FactorBarChartProps extends FactorChartProps {}

export const FactorBarChart: React.FC<FactorBarChartProps> = (props) => {
  return <FactorChart {...props} />;
};

export default FactorBarChart;
