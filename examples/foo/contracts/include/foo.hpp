#include <eosio/eosio.hpp>

using namespace eosio;

class [[eosio::contract]] foo : public contract {
public:
   using contract::contract;

   struct [[eosio::table]] data {
      name owner;
      int64_t value;

      uint64_t primary_key() const { return owner.value; }
   };

   typedef multi_index<"data"_n,data> data_index;

   [[eosio::action]]
   void store(name owner, int64_t value);
};
