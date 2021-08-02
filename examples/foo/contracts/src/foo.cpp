#include "foo.hpp"

void foo::store(name owner, int64_t value) {
   require_auth(owner);

   check(value >= 0, "require non-negative value");

   data_index di(_self, _self.value);
   di.emplace(_self, [&](auto& d) {
      d.owner = owner;
      d.value = value;
   });
}

