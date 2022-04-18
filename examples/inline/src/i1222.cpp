#include <eosio/eosio.hpp>

using namespace eosio;

class [[eosio::contract]] i1222 : public contract {
public:
   using contract::contract;

   [[eosio::action]]
   void send(int64_t value)
   {
      print(" 11 ");
   }
};