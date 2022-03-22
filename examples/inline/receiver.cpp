#include <eosio/eosio.hpp>

using namespace eosio;

class [[eosio::contract]] receiver : public contract {
public:
   using contract::contract;

   [[eosio::action]]
   void receive1(int64_t value)
   {
      print(" 7 ");
   }

   [[eosio::action]]
   void receive2(int64_t value)
   {
      print(" 8 ");
   }

   [[eosio::action]]
   void receive3(int64_t value)
   {
      print(" 9 ");
   }

   [[eosio::action]]
   void receive4(int64_t value)
   {
      print(" 10 ");
   }
};
