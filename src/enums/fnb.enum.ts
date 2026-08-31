export enum FnbDietaryType {
  VEG = 'veg',
  NON_VEG = 'non_veg',
  EGG = 'egg',
  JAIN = 'jain',
  MIXED = 'mixed',
  VEGAN = 'vegan',
}

export enum FnbMealSlot {
  BREAKFAST = 'breakfast',
  LUNCH = 'lunch',
  SNACKS = 'snacks',
  DINNER = 'dinner',
}

export enum FnbMenuType {
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
  CUSTOM_RANGE = 'custom_range',
}

export enum FnbMenuStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  ARCHIVED = 'archived',
}

export enum FnbSubscriptionStatus {
  ACTIVE = 'active',
  PAUSED = 'paused',
  CANCELLED = 'cancelled',
  COMPLETED = 'completed',
}

export enum FnbOrderStatus {
  PLACED = 'placed',
  SERVED = 'served',
  CANCELLED = 'cancelled',
}

export enum FnbDishCategory {
  BREAKFAST = 'breakfast',
  STARTERS = 'starters',
  MAIN_COURSE = 'main_course',
  BREADS = 'breads',
  RICE_BIRYANI = 'rice_biryani',
  SNACKS_DESSERTS = 'snacks_desserts',
  BEVERAGES = 'beverages',
  OTHER = 'other',
}
