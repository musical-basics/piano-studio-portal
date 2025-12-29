alter table lessons 
add column reminder_24h_sent boolean default false,
add column reminder_2h_sent boolean default false,
add column reminder_15m_sent boolean default false;
