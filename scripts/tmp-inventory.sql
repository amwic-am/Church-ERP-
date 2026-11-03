select r.key, r.name_am, count(rp.permission_id) as perms
from public.roles r
left join public.role_permissions rp on rp.role_id = r.id
group by r.key, r.name_am
order by r.key;
