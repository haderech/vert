#include <eosio/eosio.hpp>
#include <eosio/transaction.hpp>

using namespace eosio;

class [[eosio::contract]] foo : public contract {
public:
   using contract::contract;

   struct [[eosio::table]] data {
      name        owner;
      int64_t     value;

      uint64_t primary_key() const { return owner.value; }
   };

   typedef multi_index<"data"_n, data> data_index;

   [[eosio::action]]
   void store(name owner, int64_t value)
   {
      require_auth(owner);

      check(value >= 0, "require non-negative value");

      data_index di( get_self(), get_self().value);
      di.emplace(_self, [&](auto& d) {
         d.owner = owner;
         d.value = value;
      });
   }
};
