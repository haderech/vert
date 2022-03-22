#include <eosio/eosio.hpp>

using namespace eosio;

class [[eosio::contract]] notified3 : public contract {
public:
   using contract::contract;

   [[eosio::action]]
   void empty(){}
   
   [[eosio::on_notify("*::send2")]]
   void send2(name owner, int64_t value) {
      print(" 5 ");
   }
};
