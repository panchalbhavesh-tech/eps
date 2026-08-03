import React from 'react';
import { QuickFilterPills, QuickFilterPillsProps, FilterOption } from './QuickFilterPills';

export type { FilterOption };
export interface FilterChipGroupProps extends QuickFilterPillsProps {}

export const FilterChipGroup: React.FC<FilterChipGroupProps> = (props) => {
  return <QuickFilterPills {...props} />;
};

export default FilterChipGroup;
